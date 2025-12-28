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
let shopDataRef;
let unsubStock, unsubSales, unsubRepairs, unsubRecharges;

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

    // --- DISPLAY VERSION NUMBER ---
    if (window.electronAPI) {
        window.electronAPI.getAppVersion().then(version => {
            const sidebarEl = document.getElementById('version_display_sidebar');
            const settingsEl = document.getElementById('version_display_settings');
            if (sidebarEl) sidebarEl.textContent = `v${version}`;
            if (settingsEl) settingsEl.textContent = `Current Version: v${version}`;
        }).catch(err => console.log("Version check failed", err));
    }

    const loginBtn = document.getElementById('login_button');
    const signupBtn = document.getElementById('signup_button');
    const logoutBtn = document.getElementById('logout_button');

    if(loginBtn) loginBtn.addEventListener('click', handleLogin);
    if(signupBtn) signupBtn.addEventListener('click', handleSignup);
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    auth.onAuthStateChanged(user => {
        if (user) {
            document.getElementById('user_email_display').textContent = user.email;
            shopDataRef = db.collection('shops').doc(user.uid);
            initializeAppAndListen(user.uid);
            document.getElementById('main_app_container').classList.remove('hidden');
            document.getElementById('auth_container').classList.add('hidden');
            document.getElementById('loading_container').classList.add('hidden');
        } else {
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
    
    // --- UPDATER LOGIC ---
    if (window.electronAPI) {
        window.electronAPI.onUpdateAvailable((info) => {
            updateInfo = info;
            showStatus('update_check_status', `New version v${info.version} found! Downloading...`);
            const bell = document.getElementById('update_notification_bell');
            if (bell) {
                bell.classList.remove('hidden');
                bell.onclick = () => {
                    const modal = document.getElementById('update_modal');
                    if(modal) {
                        modal.classList.add('flex');
                        window.electronAPI.startDownload();
                    }
                };
            }
            if(document.getElementById('settings') && !document.getElementById('settings').classList.contains('hidden')) {
                 const modal = document.getElementById('update_modal');
                 if(modal) {
                     modal.classList.add('flex');
                     window.electronAPI.startDownload();
                 }
            }
        });

        window.electronAPI.onDownloadProgress((progressObj) => {
            const progressBar = document.getElementById('progress_bar');
            const updateDetails = document.getElementById('update_details');
            if(progressBar) progressBar.style.width = `${progressObj.percent}%`;
            if(updateDetails) {
                const speed = (progressObj.bytesPerSecond / 1024 / 1024).toFixed(2);
                updateDetails.textContent = `Downloading: ${speed} MB/s (${progressObj.percent.toFixed(0)}%)`;
            }
        });

        window.electronAPI.onUpdateDownloaded(() => {
            const title = document.getElementById('update_title');
            const msg = document.getElementById('update_message');
            if(title) title.textContent = 'Update Ready';
            if(msg) msg.textContent = 'Restart now to install?';
            
            const progContainer = document.getElementById('progress_bar_container');
            if(progContainer) progContainer.classList.add('hidden');
            
            const restartButton = document.getElementById('restart_button');
            if(restartButton) {
                restartButton.classList.remove('hidden');
                restartButton.onclick = () => window.electronAPI.restartApp();
            }
            showStatus('update_check_status', 'Update ready. Restart required.');
        });

        window.electronAPI.onUpdateNotAvailable(() => {
            showStatus('update_check_status', 'You are on the latest version.', false);
        });

        window.electronAPI.onUpdateError((err) => {
            console.error(err);
            showStatus('update_check_status', 'Update check failed.', true);
            const modal = document.getElementById('update_modal');
            if(modal) modal.classList.remove('flex');
        });
    }
});

// --- AUTHENTICATION ---
function handleLogin() {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    document.getElementById('auth_error').textContent = '';
    auth.signInWithEmailAndPassword(email, password).catch(error => document.getElementById('auth_error').textContent = error.message);
}
function handleSignup() {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    document.getElementById('auth_error').textContent = '';
    auth.createUserWithEmailAndPassword(email, password).catch(error => document.getElementById('auth_error').textContent = error.message);
}
function handleLogout() { auth.signOut(); }

// --- DATA INITIALIZATION ---
async function initializeAppAndListen(userId) {
    const doc = await shopDataRef.get();
    if (!doc.exists) {
        await shopDataRef.set({ stock: [], apiKey: '', categories: ["Mobile Accessory", "Repair Part", "SIM Card", "Other"] });
    }
    unsubStock = shopDataRef.onSnapshot(snapshot => {
        const data = snapshot.data();
        if(data) {
            stock = data.stock || [];
            apiKey = data.apiKey || '';
            categories = data.categories || ["Mobile Accessory", "Repair Part", "Other"];
            if(currentActivePage === 'add_stock' || currentActivePage === 'check_inventory' || currentActivePage === 'homepage') {
                navigate(currentActivePage);
            }
        }
    });
    unsubSales = shopDataRef.collection('sales').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        salesLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(currentActivePage === 'sales_details' || currentActivePage === 'homepage') navigate(currentActivePage);
    });
    unsubRepairs = shopDataRef.collection('repairs').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        repairLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(currentActivePage === 'repair_details') navigate(currentActivePage);
    });
    unsubRecharges = shopDataRef.collection('recharges').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        rechargeLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(currentActivePage === 'recharge_details') navigate(currentActivePage);
    });
}

// --- MAIN DATA SAVING ---
async function saveMainData() {
    if (!shopDataRef) return;
    try { await shopDataRef.set({ stock, categories, apiKey }, { merge: true }); }
    catch (error) { alert("Error Saving Data: " + error.message); }
}

// --- NAVIGATION & UI ---
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
    
    if(pageId === 'homepage') renderHomepage();
    if(pageId === 'add_stock' || pageId === 'check_inventory') { 
        renderCategoryDropdowns(); 
        if(pageId==='check_inventory') renderInventory(); 
    }
    if(pageId === 'record_sale') {
        if(document.getElementById('barcode_scan_input')) document.getElementById('barcode_scan_input').focus();
    }
    if(pageId === 'sales_details') { 
        document.getElementById('sales_start_date').value = today; 
        document.getElementById('sales_end_date').value = today; 
        renderSalesDetails(); 
    }
    if(pageId === 'repair_details') { 
        document.getElementById('repair_start_date').value = today; 
        document.getElementById('repair_end_date').value = today; 
        renderRepairDetails(); 
    }
    if(pageId === 'recharge_details') { 
        document.getElementById('recharge_start_date').value = today; 
        document.getElementById('recharge_end_date').value = today; 
        renderRechargeDetails(); 
    }
    if(pageId === 'reports') { 
        document.getElementById('report_month_year').value = currentYear; 
        document.getElementById('report_year').value = currentYear; 
        document.getElementById('ai_summary_container').classList.add('hidden'); 
    }
    if(pageId === 'settings') document.getElementById('api_key_input').value = apiKey;
}

function renderHomepage() {
    const today = new Date().toISOString().split('T')[0];
    const todaysSales = salesLog.filter(s => s.timestamp.startsWith(today));
    document.getElementById('today_revenue').textContent = formatCurrency(todaysSales.reduce((sum, s) => sum + s.total, 0));
    document.getElementById('today_profit').textContent = formatCurrency(todaysSales.reduce((sum, s) => sum + s.profit, 0));
    
    const lowStockList = document.getElementById('low_stock_list');
    lowStockList.innerHTML = '';
    const lowStockItems = stock.filter(item => item.quantity <= 5);
    if (lowStockItems.length > 0) {
        lowStockItems.forEach(i => lowStockList.innerHTML += `<p class="text-gray-300 p-2 bg-gray-700 rounded-md mb-2">${i.name} - <span class="font-bold">${i.quantity} left</span></p>`);
    } else {
        lowStockList.innerHTML = '<p class="text-gray-400">No low stock items. Great job!</p>';
    }
}

function updateClock() { 
    const clock = document.getElementById('clock');
    if(clock) clock.textContent = new Date().toLocaleTimeString(); 
}

function showStatus(id, msg, isErr = false) {
    const el = document.getElementById(id); if(!el) return;
    el.textContent = msg; 
    el.className = `h-6 text-center ${isErr ? 'text-red-400' : 'text-green-400'}`;
    setTimeout(() => { if(el) el.textContent = ''; }, 4000);
}

function formatCurrency(a) { return `₹${Number(a || 0).toFixed(2)}`; }
function formatCurrencyForPDF(a) { return `Rs. ${Number(a || 0).toFixed(2)}`; }

function showConfirmModal(text, onConfirm) {
    const modal = document.getElementById('confirm_modal');
    modal.querySelector('#confirm_modal_text').textContent = text;
    const btn = modal.querySelector('#confirm_modal_yes');
    const newBtn = btn.cloneNode(true); 
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => { onConfirm(); closeConfirmModal(); });
    modal.classList.add('flex');
}
function closeConfirmModal(){ document.getElementById('confirm_modal').classList.remove('flex'); }

// --- CATEGORIES ---
async function addCategory() {
    const input = document.getElementById('new_category_name');
    const newCat = input.value.trim();
    if (newCat && !categories.find(c => c.toLowerCase() === newCat.toLowerCase())) {
        categories.push(newCat); await saveMainData();
        input.value = ''; renderCategoryList(); renderCategoryDropdowns();
    }
}
function removeCategory(c) { 
    showConfirmModal(`Remove "${c}"?`, async () => { 
        categories = categories.filter(cat => cat !== c); 
        await saveMainData(); 
        renderCategoryList(); 
        renderCategoryDropdowns(); 
    }); 
}
function removeAllCategories() { 
    showConfirmModal("Remove all?", async () => { 
        categories = ["Other"]; 
        await saveMainData(); 
        renderCategoryList(); 
        renderCategoryDropdowns(); 
    }); 
}
function openCategoryManager() { renderCategoryList(); document.getElementById('category_manager_modal').classList.add('flex'); }
function closeCategoryManager() { document.getElementById('category_manager_modal').classList.remove('flex'); }

function renderCategoryList() { 
    const list = document.getElementById('category_list');
    if(!list) return;
    list.innerHTML = categories.map(c => `<div class="flex justify-between items-center bg-gray-700 p-2 rounded"><span>${c}</span><button onclick="removeCategory('${c}')" class="text-red-400 font-bold">X</button></div>`).join(''); 
}

function renderCategoryDropdowns() {
    document.querySelectorAll('select[id*="category"]').forEach(s => {
        const val = s.value; const isF = s.id.includes('filter');
        s.innerHTML = isF ? '<option value="All Categories">All Categories</option>' : '';
        categories.forEach(c => s.innerHTML += `<option value="${c}">${c}</option>`);
        if(val && Array.from(s.options).some(o=>o.value===val)) s.value = val;
    });
}

// --- STOCK ---
async function saveStockItem() {
    const name = document.getElementById('product_name').value.trim();
    const barcode = document.getElementById('barcode').value.trim();
    const cat = document.getElementById('product_category').value || "Other";
    const price = parseFloat(document.getElementById('purchase_price').value) || 0;
    const qty = parseInt(document.getElementById('quantity').value);
    
    if(!name || !cat || isNaN(qty) || qty < 0) { showStatus('stock_status', 'Check fields.', true); return; }
    if (barcode && stock.find(i => i.barcode === barcode)) { showStatus('stock_status', 'Barcode exists.', true); return; }
    
    const existing = stock.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        showConfirmModal(`"${name}" exists. Add Qty?`, async () => {
             existing.quantity += qty; if (barcode && !existing.barcode) existing.barcode = barcode;
             await saveMainData(); showStatus('stock_status', `Added ${qty}.`); document.getElementById('quantity').value = '';
        });
    } else {
        stock.push({ id: Date.now(), name, barcode, category: cat, purchasePrice: price, quantity: qty });
        await saveMainData(); showStatus('stock_status', `Saved.`);
        document.getElementById('product_name').value = ''; document.getElementById('barcode').value = ''; document.getElementById('quantity').value = '';
    }
}
function renderInventory() {
    const list = document.getElementById('inventory_list');
    const filterEl = document.getElementById('inventory_category_filter');
    const filter = filterEl ? filterEl.value : 'All Categories';
    
    const items = (filter === 'All Categories') ? stock : stock.filter(i => i.category === filter);
    list.innerHTML = items.length ? '' : '<div class="text-center p-4 col-span-7">Empty</div>';
    
    items.forEach(i => list.innerHTML += `<div class="grid grid-cols-7 gap-4 items-center bg-gray-700 p-2 rounded"><div class="col-span-2 truncate">${i.name}</div><div class="truncate">${i.barcode||'-'}</div><div class="truncate">${i.category}</div><div class="text-right">${formatCurrency(i.purchasePrice)}</div><div class="text-center">${i.quantity}</div><div class="text-center space-x-1"><button onclick="openEditStockModal(${i.id})" class="bg-yellow-600 px-2 py-1 rounded text-xs">Edit</button><button onclick="openAdjustQuantityModal(${i.id})" class="bg-blue-600 px-2 py-1 rounded text-xs">Adj</button><button onclick="confirmRemoveItem(${i.id})" class="bg-red-600 px-2 py-1 rounded text-xs">Del</button></div></div>`);
}

function confirmRemoveItem(id) { const i = stock.find(x => x.id === id); if(i) showConfirmModal(`Remove "${i.name}"?`, async () => { stock = stock.filter(x => x.id !== id); await saveMainData(); renderInventory(); }); }

async function adjustQuantity(id) {
    const i = stock.find(x => x.id === id); const q = parseInt(document.getElementById('quantity_to_remove').value);
    if(isNaN(q) || q<=0 || q>i.quantity) { showStatus('adjust_status', 'Invalid Qty', true); return; }
    i.quantity -= q; await saveMainData(); closeAdjustQuantityModal(); renderInventory();
}

async function saveStockChanges() {
    const i = stock.find(x => x.id === editingItemId); if(!i) return;
    i.name = document.getElementById('edit_product_name').value;
    i.barcode = document.getElementById('edit_barcode').value;
    i.category = document.getElementById('edit_product_category').value;
    i.purchasePrice = parseFloat(document.getElementById('edit_purchase_price').value) || 0;
    await saveMainData(); closeEditStockModal(); renderInventory();
}

function openAdjustQuantityModal(id) { 
    const i = stock.find(x=>x.id===id); 
    document.getElementById('adjust_product_name').textContent=i.name; 
    document.getElementById('adjust_current_quantity').textContent=`Qty: ${i.quantity}`; 
    document.getElementById('quantity_to_remove').value=''; 
    document.getElementById('adjust_quantity_confirm').onclick=()=>adjustQuantity(id); 
    document.getElementById('adjust_quantity_modal').classList.add('flex'); 
}
function closeAdjustQuantityModal() { document.getElementById('adjust_quantity_modal').classList.remove('flex'); }

function openEditStockModal(id) { 
    editingItemId=id; 
    const i = stock.find(x=>x.id===id); 
    renderCategoryDropdowns(); 
    document.getElementById('edit_product_name').value=i.name; 
    document.getElementById('edit_barcode').value=i.barcode; 
    document.getElementById('edit_product_category').value=i.category; 
    document.getElementById('edit_purchase_price').value=i.purchasePrice; 
    const saveBtn = document.getElementById('save_changes_btn');
    if(saveBtn) saveBtn.onclick = saveStockChanges;
    document.getElementById('edit_stock_modal').classList.add('flex'); 
}
function closeEditStockModal() { editingItemId=null; document.getElementById('edit_stock_modal').classList.remove('flex'); }

// --- SALES ---
function handleBarcodeScan() {
    const bc = document.getElementById('barcode_scan_input'); const val = bc.value.trim(); if(!val) return;
    const p = stock.find(i => i.barcode === val); bc.value = '';
    if(p && p.quantity > 0) openSellPriceModal(p); else showStatus('sale_entry_status', p ? 'Out of stock' : 'Not found', true);
}
function openSellPriceModal(p) { 
    productForPriceEntry=p; 
    document.getElementById('sell_price_product_name').textContent=p.name; 
    document.getElementById('sell_price_input').value=Math.round(p.purchasePrice*1.5); 
    const confirmBtn = document.getElementById('sell_price_confirm');
    confirmBtn.onclick = confirmSellPrice;
    document.getElementById('sell_price_modal').classList.add('flex'); 
    document.getElementById('sell_price_input').focus(); 
}
function closeSellPriceModal() { 
    productForPriceEntry=null; 
    document.getElementById('sell_price_modal').classList.remove('flex'); 
    if(document.getElementById('barcode_scan_input')) document.getElementById('barcode_scan_input').focus(); 
}
function confirmSellPrice() { 
    const sp = parseFloat(document.getElementById('sell_price_input').value); 
    if(isNaN(sp)||sp<=0) return; 
    currentSale.push({...productForPriceEntry, sellPrice:sp, sellQuantity:1, totalProfit:(sp-productForPriceEntry.purchasePrice)}); 
    renderCart(); 
    closeSellPriceModal(); 
}

function openProductSearch() { document.getElementById('product_search_input').value=''; filterProductSearch(); document.getElementById('product_search_modal').classList.add('flex'); document.getElementById('product_search_input').focus(); }
function closeProductSearch() { document.getElementById('product_search_modal').classList.remove('flex'); }

function filterProductSearch() {
    const q = document.getElementById('product_search_input').value.toLowerCase(); const res = document.getElementById('product_search_results');
    const items = stock.filter(i => i.name.toLowerCase().includes(q) && i.quantity>0);
    res.innerHTML = items.length ? items.map(i => `<button onclick="selectProductForSale(${i.id})" class="w-full text-left p-2 hover:bg-gray-700">${i.name} (${i.quantity})</button>`).join('') : '<div class="text-gray-400 p-2">None</div>';
}
function selectProductForSale(id) { 
    selectedProductForSale=stock.find(i=>i.id===id); 
    document.getElementById('select_product_button').textContent=selectedProductForSale.name; 
    document.getElementById('available_stock').textContent=`Avail: ${selectedProductForSale.quantity}`; 
    closeProductSearch(); 
}
function addItemToSale() {
    if(!selectedProductForSale) return; const sp = parseFloat(document.getElementById('selling_price').value); const q = parseInt(document.getElementById('quantity_sold').value);
    if(isNaN(sp)||isNaN(q)||q<=0||q>selectedProductForSale.quantity) { showStatus('sale_entry_status', 'Invalid input', true); return; }
    currentSale.push({...selectedProductForSale, sellPrice:sp, sellQuantity:q, totalProfit:(sp-selectedProductForSale.purchasePrice)*q});
    renderCart(); selectedProductForSale=null; document.getElementById('select_product_button').textContent='Select...'; document.getElementById('selling_price').value=''; document.getElementById('quantity_sold').value='1';
}
function renderCart() {
    const c = document.getElementById('cart_items');
    c.innerHTML = currentSale.length ? currentSale.map((i,idx) => `<div class="grid grid-cols-5 gap-2 items-center bg-gray-700 p-2 rounded"><div class="col-span-2 truncate">${i.name}</div><div class="text-center">${i.sellQuantity}</div><div class="text-center">${formatCurrency(i.sellPrice)}</div><div class="flex justify-end"><button onclick="removeItemFromSale(${idx})" class="text-red-400 text-xs">X</button></div></div>`).join('') : '<div class="text-center p-4 text-gray-400">Empty</div>';
    
    const total = currentSale.reduce((a,b)=>a+(b.sellPrice*b.sellQuantity),0);
    const profit = currentSale.reduce((a,b)=>a+b.totalProfit,0);
    
    document.getElementById('cart_total_amount').textContent=`Total: ${formatCurrency(total)}`;
    document.getElementById('cart_total_profit').textContent=`Profit: ${formatCurrency(profit)}`;
}
function removeItemFromSale(idx) { currentSale.splice(idx,1); renderCart(); }

async function completeSale() {
    if(!currentSale.length) return;
    const batch = currentSale.map(s => {
        const i = stock.find(x=>x.id===s.id); if(i) i.quantity -= s.sellQuantity;
        return shopDataRef.collection('sales').add({ timestamp: new Date().toISOString(), productName: s.name, category: s.category, quantity: s.sellQuantity, sellPrice: s.sellPrice, total: s.sellPrice*s.sellQuantity, profit: s.totalProfit });
    });
    await Promise.all(batch); await saveMainData(); currentSale=[]; renderCart(); showStatus('sale_status', 'Done!');
}

// --- HISTORY ---
function renderSalesDetails() {
    const list=document.getElementById('sales_details_list'); const s=document.getElementById('sales_start_date').value; const e=document.getElementById('sales_end_date').value; const q=document.getElementById('sales_search').value.toLowerCase();
    const items=salesLog.filter(x => (!s||x.timestamp>=s) && (!e||x.timestamp.split('T')[0]<=e) && (!q||x.productName.toLowerCase().includes(q)));
    list.innerHTML = items.length ? items.map(x => `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(x.timestamp).toLocaleString()}</td><td class="p-2">${x.productName}</td><td class="p-2">${x.quantity}</td><td class="p-2">${formatCurrency(x.sellPrice)}</td><td class="p-2">${formatCurrency(x.total)}</td><td class="p-2">${formatCurrency(x.profit)}</td></tr>`).join('') : '<tr><td colspan="6" class="text-center p-4">No data</td></tr>';
    document.getElementById('sales_total_revenue').textContent=`Rev: ${formatCurrency(items.reduce((a,b)=>a+b.total,0))}`;
    document.getElementById('sales_total_profit').textContent=`Profit: ${formatCurrency(items.reduce((a,b)=>a+b.profit,0))}`;
}

async function saveRepairLog() {
    const n=document.getElementById('repair_customer_name').value; const m=document.getElementById('repair_mobile').value; const c=parseFloat(document.getElementById('repair_cost').value); const sp=parseFloat(document.getElementById('repair_sell_price').value);
    if(n&&m&&!isNaN(c)&&!isNaN(sp)) { await shopDataRef.collection('repairs').add({timestamp:new Date().toISOString(), customerName:n, mobileNumber:m, cost:c, sellPrice:sp, profit:sp-c}); showStatus('repair_status','Saved'); }
}
function renderRepairDetails() {
    const list=document.getElementById('repair_details_list'); const s=document.getElementById('repair_start_date').value; const e=document.getElementById('repair_end_date').value; const q=document.getElementById('repair_search').value.toLowerCase();
    const items=repairLog.filter(x => (!s||x.timestamp>=s) && (!e||x.timestamp.split('T')[0]<=e) && (!q||x.customerName.toLowerCase().includes(q)||x.mobileNumber.includes(q)));
    list.innerHTML = items.length ? items.map(x => `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(x.timestamp).toLocaleString()}</td><td class="p-2">${x.customerName}</td><td class="p-2">${x.mobileNumber}</td><td class="p-2">${formatCurrency(x.cost)}</td><td class="p-2">${formatCurrency(x.sellPrice)}</td><td class="p-2">${formatCurrency(x.profit)}</td></tr>`).join('') : '<tr><td colspan="6" class="text-center p-4">No data</td></tr>';
    document.getElementById('repair_total_cost').textContent=`Cost: ${formatCurrency(items.reduce((a,b)=>a+b.cost,0))}`;
    document.getElementById('repair_total_revenue').textContent=`Rev: ${formatCurrency(items.reduce((a,b)=>a+b.sellPrice,0))}`;
    document.getElementById('repair_total_profit').textContent=`Profit: ${formatCurrency(items.reduce((a,b)=>a+b.profit,0))}`;
}

async function saveRechargeLog() {
    const m=document.getElementById('recharge_mobile').value; const c=document.getElementById('recharge_company').value; const a=parseFloat(document.getElementById('recharge_amount').value);
    if(m&&!isNaN(a)) { await shopDataRef.collection('recharges').add({timestamp:new Date().toISOString(), mobileNumber:m, company:c, amount:a}); showStatus('recharge_status','Saved'); }
}
function renderRechargeDetails() {
    const list=document.getElementById('recharge_details_list'); const s=document.getElementById('recharge_start_date').value; const e=document.getElementById('recharge_end_date').value; const c=document.getElementById('recharge_company_filter').value;
    const items=rechargeLog.filter(x => (!s||x.timestamp>=s) && (!e||x.timestamp.split('T')[0]<=e) && (c==='All Companies'||x.company===c));
    list.innerHTML = items.length ? items.map(x => `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(x.timestamp).toLocaleString()}</td><td class="p-2">${x.mobileNumber}</td><td class="p-2">${x.company}</td><td class="p-2">${formatCurrency(x.amount)}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center p-4">No data</td></tr>';
    document.getElementById('recharge_total_amount').textContent=`Total: ${formatCurrency(items.reduce((a,b)=>a+b.amount,0))}`;
}

// --- API KEY & SETTINGS ---
async function saveApiKey() { 
    apiKey = document.getElementById('api_key_input').value.trim(); 
    await saveMainData(); 
    showStatus('api_key_status', 'Saved.'); 
}

function checkForUpdate() { 
    showStatus('update_check_status', 'Checking...', false); 
    if (window.electronAPI) window.electronAPI.checkForUpdate(); 
}

function promptResetAllData() { 
    showConfirmModal("DELETE ALL DATA?", async () => { 
        stock=[]; categories=["Other"]; apiKey=''; 
        await saveMainData(); 
        location.reload(); 
    }); 
}

function saveBackupToFile() { 
    const blob = new Blob([JSON.stringify({stock,salesLog, repairLog, rechargeLog}, null, 2)], {type:'application/json'}); 
    const a=document.createElement('a'); 
    a.href=URL.createObjectURL(blob); 
    a.download='backup.json'; 
    a.click(); 
}

// --- REPORTING HELPERS ---
function toggleReportOptions() { 
    const type = document.getElementById('report_type').value; 
    document.getElementById('monthly_options').classList.toggle('hidden', type !== 'Monthly'); 
    document.getElementById('yearly_options').classList.toggle('hidden', type !== 'Yearly'); 
}

function getPeriodRanges() {
    const type = document.getElementById('report_type').value;
    let start, end, title;
    const now = new Date();

    if (type === 'Daily') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
        title = `Daily Report (${new Date().toLocaleDateString()})`;
    } else if (type === 'Monthly') {
        const m = parseInt(document.getElementById('report_month').value);
        const y = parseInt(document.getElementById('report_month_year').value);
        if(!m || !y) return null;
        start = new Date(y, m - 1, 1).toISOString();
        end = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
        title = `Monthly Report (${m}/${y})`;
    } else { // Yearly
        const y = parseInt(document.getElementById('report_year').value);
        if(!y) return null;
        start = new Date(y, 0, 1).toISOString();
        end = new Date(y, 11, 31, 23, 59, 59, 999).toISOString();
        title = `Yearly Report (${y})`;
    }
    return { start, end, title };
}

function getReportData(start, end) {
    const sales = salesLog.filter(x => x.timestamp >= start && x.timestamp <= end);
    const repairs = repairLog.filter(x => x.timestamp >= start && x.timestamp <= end);
    const recharges = rechargeLog.filter(x => x.timestamp >= start && x.timestamp <= end);
    return { sales, repairs, recharges };
}

// --- AI FEATURES (FIXED VERSION TO v1) ---
async function getAIInsights() {
    if (!apiKey) { showStatus('report_status', 'No API Key.', true); return; }
    
    const periods = getPeriodRanges();
    if (!periods) { showStatus('report_status', 'Invalid Date', true); return; }

    document.getElementById('ai_summary_container').classList.remove('hidden'); 
    document.getElementById('ai_summary_content').innerHTML = 'Analyzing...';
    
    const data = getReportData(periods.start, periods.end);
    const totalRev = data.sales.reduce((a,b)=>a+b.total,0);
    const totalProf = data.sales.reduce((a,b)=>a+b.profit,0);

    const prompt = `Analyze this shop data for ${periods.title}:
    Sales Revenue: ${totalRev}, Sales Profit: ${totalProf}.
    Top sold items: ${data.sales.map(s=>s.productName).slice(0,5).join(', ')}.
    Give me 3 brief bullet points on performance and 1 advice.`;

    try {
        // USING v1 (STABLE) AND gemini-1.5-flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
        });
        const result = await response.json();
        
        if (result.error) throw new Error(result.error.message);
        const text = result.candidates[0].content.parts[0].text;
        
        document.getElementById('ai_summary_content').innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    } catch (e) { 
        console.error(e);
        document.getElementById('ai_summary_content').textContent = 'Error: ' + e.message; 
    }
}

async function getCustomAIInsight() {
    if (!apiKey) { showStatus('report_status', 'No API Key.', true); return; }
    
    const query = document.getElementById('custom_ai_prompt').value.trim();
    if (!query) return;

    document.getElementById('ai_summary_container').classList.remove('hidden'); 
    document.getElementById('ai_summary_content').innerHTML = 'Thinking...';

    const dataSnapshot = {
        inventory_sample: stock.slice(0, 20),
        recent_sales: salesLog.slice(0, 20),
        total_stock_items: stock.length
    };

    const prompt = `I am a mobile shop owner. Here is a sample of my data JSON: ${JSON.stringify(dataSnapshot)}. 
    User Question: "${query}"
    Answer briefly based on the data provided.`;

    try {
        // USING v1 (STABLE) AND gemini-1.5-flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
        });
        const result = await response.json();
        
        if (result.error) throw new Error(result.error.message);
        document.getElementById('ai_summary_content').innerHTML = result.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    } catch (e) { 
        document.getElementById('ai_summary_content').textContent = 'Error: ' + e.message; 
    }
}

// --- PDF REPORT ---
function generatePDFReport() {
    if (!window.jspdf) { alert("PDF library not loaded. Check internet."); return; }
    
    const { jsPDF } = window.jspdf; 
    const doc = new jsPDF();
    
    const periods = getPeriodRanges(); 
    if (!periods) { showStatus('report_status', 'Check dates', true); return; }
    
    const data = getReportData(periods.start, periods.end);
    const totalSales = data.sales.reduce((a,b)=>a+b.total,0);
    const totalProfit = data.sales.reduce((a,b)=>a+b.profit,0);
    const totalRepairRevenue = data.repairs.reduce((a,b)=>a+b.sellPrice,0); // Changed to Sell Price

    // Title
    doc.setFontSize(18);
    doc.text("Mahavir Mobile Shop - Financial Report", 14, 20);
    doc.setFontSize(12);
    doc.text(periods.title, 14, 30);
    
    // Summary Box
    doc.setDrawColor(0);
    doc.setFillColor(240, 240, 240);
    doc.rect(14, 35, 180, 25, 'F');
    doc.text(`Total Sales: Rs. ${totalSales.toFixed(2)}`, 20, 45);
    doc.text(`Total Profit: Rs. ${totalProfit.toFixed(2)}`, 20, 55);
    doc.text(`Repair Revenue: Rs. ${totalRepairRevenue.toFixed(2)}`, 100, 45); // Updated label

    // Sales Table
    doc.text("Sales Details", 14, 70);
    const tableBody = data.sales.map(s => [
        new Date(s.timestamp).toLocaleDateString(),
        s.productName,
        s.quantity.toString(),
        s.sellPrice.toFixed(2),
        s.total.toFixed(2)
    ]);

    doc.autoTable({
        startY: 75,
        head: [['Date', 'Product', 'Qty', 'Price', 'Total']],
        body: tableBody,
    });

    doc.save("Shop_Report.pdf");
    showStatus('report_status', `PDF Saved.`);
}