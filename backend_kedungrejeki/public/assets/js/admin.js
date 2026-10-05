// --- Script Admin Panel Terintegrasi (Live Ready & Full Version - Fixed Notif Access) ---
const pb = new PocketBase('http://127.0.0.1:8090');
const SERVER_URL = 'http://localhost:5000';

let cashChartInstance = null;
let html5QrCode = null;
let rawBookings = [];
let rawPayments = [];
let rawInventory = [];
let rawExpenses = [];
let rawInventoryLogs = [];

const BACKGROUND_TIMEOUT_MS = 10000;
let backgroundTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  checkWaStatus();
  initVisibilityListener();
});

function initVisibilityListener() {
  document.addEventListener('visibilitychange', () => {
    if (!pb.authStore.isValid) return;

    if (document.hidden) {
      backgroundTimer = setTimeout(() => {
        if (document.hidden && pb.authStore.isValid) {
          logoutAdmin();
          alert('Sesi admin diakhiri secara otomatis karena laman/tab ditinggalkan selama lebih dari 10 detik.');
        }
      }, BACKGROUND_TIMEOUT_MS);
    } else {
      if (backgroundTimer) {
        clearTimeout(backgroundTimer);
        backgroundTimer = null;
      }
    }
  });
}

function switchTab(tabName) {
  const tabs = ['wa-web', 'finances', 'pettycash', 'inventory', 'inv-logs', 'bookings', 'checkin-scan', 'master-qr', 'transactions', 'wa-admin', 'api-keys'];
  tabs.forEach(t => {
    const tabEl = document.getElementById(`tab-${t}`);
    const menuEl = document.getElementById(`menu-${t}`);
    if (tabEl) tabEl.classList.add('d-none');
    if (menuEl) menuEl.classList.remove('active');
  });

  const activeTab = document.getElementById(`tab-${tabName}`);
  const activeMenu = document.getElementById(`menu-${tabName}`);
  if (activeTab) activeTab.classList.remove('d-none');
  if (activeMenu) activeMenu.classList.add('active');

  if (tabName === 'checkin-scan') initCameraScanner();
  if (tabName === 'wa-web') checkWaStatus();
  if (tabName === 'inventory') loadInventoryData();
  if (tabName === 'inv-logs') loadInventoryLogs();
  if (tabName === 'pettycash') loadExpenseData();
  if (tabName === 'master-qr') initMasterQrModule();
  if (tabName === 'wa-admin') loadWaAdminList();
  if (tabName === 'bookings') {
    if (typeof loadDashboardData === 'function') loadDashboardData();
  }
}

async function checkWaStatus() {
  const badge = document.getElementById('wa-connection-badge');
  if (!badge) return;
  try {
    const res = await fetch(`${SERVER_URL}/api/admin/wa-status`);
    const data = await res.json();
    if (data.connected) {
      badge.className = 'badge bg-success text-white';
      badge.innerHTML = '<i class="ti ti-circle-check me-1"></i> WhatsApp Terhubung';
    } else {
      badge.className = 'badge bg-danger text-white';
      badge.innerHTML = '<i class="ti ti-circle-x me-1"></i> WhatsApp Terputus';
    }
  } catch (err) {
    badge.className = 'badge bg-warning text-dark';
    badge.innerHTML = 'Server Offline';
  }
}

// Handler Form Pairing WhatsApp
const formWaPair = document.getElementById('form-wa-pair');
if (formWaPair) {
  formWaPair.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phoneInput = document.getElementById('wa-pair-phone').value.trim();
    const btn = document.getElementById('btn-request-pair-code');
    const displayBox = document.getElementById('pairing-code-display');
    const codeText = document.getElementById('text-pairing-code');

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Meminta Kode...`;

    try {
      const res = await fetch(`${SERVER_URL}/api/admin/wa-pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneInput })
      });
      const data = await res.json();
      if (data.success && data.pairingCode) {
        displayBox.classList.remove('d-none');
        codeText.textContent = data.pairingCode;
      } else {
        alert('Gagal: ' + (data.message || 'Terjadi kesalahan.'));
      }
    } catch (err) {
      alert('Gagal terhubung ke server: ' + err.message);
    }
    btn.disabled = false;
    btn.innerHTML = `<i class="ti ti-key me-1"></i> Dapatkan Kode Tautan 8 Digit`;
  });
}

function checkAuthStatus() {
  const sectionLogin = document.getElementById('section-login');
  const sectionDashboard = document.getElementById('section-dashboard');

  if (pb.authStore.isValid) {
    if (sectionLogin) sectionLogin.classList.add('d-none');
    if (sectionDashboard) sectionDashboard.classList.remove('d-none');
    const userDisplay = document.getElementById('admin-user-display');
    if (userDisplay) userDisplay.textContent = `Logged in: ${pb.authStore.model?.email || 'Admin'}`;
    
    loadDashboardData();
    loadInventoryData();
    loadExpenseData();
    loadWaAdminList();
    loadApiSettings();
  } else {
    if (sectionLogin) sectionLogin.classList.remove('d-none');
    if (sectionDashboard) sectionDashboard.classList.add('d-none');
    if (backgroundTimer) {
      clearTimeout(backgroundTimer);
      backgroundTimer = null;
    }
  }
}

const formLogin = document.getElementById('form-login');
if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    let loginSuccess = false;

    try {
      await pb.collection('_superusers').authWithPassword(email, password);
      loginSuccess = true;
    } catch (err1) {
      try {
        await pb.admins.authWithPassword(email, password);
        loginSuccess = true;
      } catch (err2) {
        try {
          await pb.collection('users').authWithPassword(email, password);
          loginSuccess = true;
        } catch (err3) {
          loginSuccess = false;
        }
      }
    }

    if (loginSuccess) {
      checkAuthStatus();
    } else {
      alert('Login gagal: Email atau password salah!');
    }
  });
}

function logoutAdmin() {
  pb.authStore.clear();
  if (backgroundTimer) {
    clearTimeout(backgroundTimer);
    backgroundTimer = null;
  }
  checkAuthStatus();
}

// Di dalam fungsi loadDashboardData(), tambahkan pemanggilan fungsi render chart setelah data ditarik:
async function loadDashboardData() {
  try {
    const bookings = await pb.collection('bookings').getFullList({ sort: '-created' }).catch(() => []);
    rawBookings = bookings;
    
    // ... (kode penarikan data total revenue, dll yang sudah ada) ...

    // Panggil fungsi render chart arus kas
    renderCashFlowChart(bookings, rawExpenses);
  } catch (err) {
    console.warn("Catatan pemuatan dashboard:", err.message);
  }
}

// Tambahkan fungsi renderCashFlowChart di bawahnya
function renderCashFlowChart(bookings, expenses) {
  const canvasEl = document.getElementById('cashFlowChart');
  if (!canvasEl) return;

  // Kelompokkan data berdasarkan tanggal sederhana (misal 7 hari terakhir atau berdasarkan data yang ada)
  const dateMap = {};
  
  bookings.forEach(b => {
    const dateKey = b.created ? b.created.substring(0, 10) : 'Lainnya';
    if (!dateMap[dateKey]) dateMap[dateKey] = { income: 0, expense: 0 };
    dateMap[dateKey].income += Number(b.total_price || 0);
  });

  expenses.forEach(e => {
    const dateKey = e.created ? e.created.substring(0, 10) : 'Lainnya';
    if (!dateMap[dateKey]) dateMap[dateKey] = { income: 0, expense: 0 };
    dateMap[dateKey].expense += Number(e.amount || 0);
  });

  const sortedKeys = Object.keys(dateMap).sort().slice(-7); // Ambil 7 data terakhir
  const incomeData = sortedKeys.map(k => dateMap[k].income);
  const expenseData = sortedKeys.map(k => dateMap[k].expense);

  if (cashChartInstance) {
    cashChartInstance.destroy();
  }

  cashChartInstance = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels: sortedKeys,
      datasets: [
        {
          label: 'Pemasukan (Cash In)',
          data: incomeData,
          borderColor: '#2fb344',
          backgroundColor: 'rgba(47, 179, 68, 0.1)',
          tension: 0.2,
          fill: true
        },
        {
          label: 'Pengeluaran',
          data: expenseData,
          borderColor: '#d63939',
          backgroundColor: 'rgba(214, 57, 57, 0.1)',
          tension: 0.2,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

async function loadPaymentData() {
  try {
    rawPayments = await pb.collection('payments').getFullList({ sort: '-created' }).catch(() => []);
    const countTrans = document.getElementById('count-transactions');
    if (countTrans) countTrans.textContent = `${rawPayments.length} Transaksi`;
    if (typeof renderPaymentTable === 'function') renderPaymentTable();
  } catch (err) {}
}

async function initCameraScanner() {
  const readerElement = document.getElementById('reader');
  if (!readerElement) return;

  setTimeout(async () => {
    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
      }

      if (html5QrCode.isScanning) {
        await html5QrCode.stop();
      }

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      await html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText) => {
          processCheckInByQrCode(decodedText);
        }, 
        (errorMessage) => {}
      );
    } catch (err) {
      console.error("Gagal menginisialisasi kamera:", err);
      alert("❌ Tidak dapat membuka kamera. Pastikan izin kamera aktif.");
    }
  }, 300);
}

async function scanQrFromFile() {
  const fileInput = document.getElementById('qr-file-input');
  if (!fileInput || !fileInput.files.length) return alert("Pilih file gambar QR dulu!");
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
  try {
    const qrCodeMessage = await html5QrCode.scanFile(fileInput.files[0], true);
    const scanResult = document.getElementById('scan-result');
    const scanResultText = document.getElementById('scan-result-text');
    if (scanResult) scanResult.classList.remove('d-none');
    if (scanResultText) scanResultText.textContent = qrCodeMessage;
    processCheckInByQrCode(qrCodeMessage);
  } catch (err) {
    alert("Gagal membaca QR dari file: " + err);
  }
}

async function processCheckInByQrCode(bookingId) {
  try {
    const booking = await pb.collection('bookings').getOne(bookingId);
    if (!booking) return alert("❌ Data reservasi tidak ditemukan.");

    const now = new Date();
    const formattedDateTime = now.toISOString().replace('T', ' ').substring(0, 19);

    if (confirm(`Konfirmasi Check-In Tamu: ${booking.guest_name}\nJam Aktual: ${formattedDateTime}?`)) {
      await pb.collection('bookings').update(booking.id, { 
        checkout_status: 'Checked-In',
        check_in_actual: formattedDateTime 
      });

      if (booking.unit_id) {
        await pb.collection('units').update(booking.unit_id, { status: 'Terisi' }).catch(() => {});
      }

      alert(`✅ Check-In Berhasil untuk ${booking.guest_name}!`);
      loadDashboardData();
    }
  } catch (err) {
    alert("❌ QR Code tidak valid / Gagal memproses check-in: " + err.message);
  }
}

async function initMasterQrModule() {
  const selectEl = document.getElementById('gen-unit-select');
  if (!selectEl) return;
  
  try {
    const units = await pb.collection('units').getFullList({ sort: 'name' }).catch(() => []);
    selectEl.innerHTML = '<option value="">Pilih Unit...</option>';
    units.forEach(u => {
      selectEl.innerHTML += `<option value="${u.id}" data-name="${u.name}">${u.name}</option>`;
    });
  } catch (err) {
    selectEl.innerHTML = '<option value="">Gagal memuat unit</option>';
  }
  loadScanLogs();
}

const formQrGen = document.getElementById('form-qr-generator');
if (formQrGen) {
  formQrGen.addEventListener('submit', (e) => {
    e.preventDefault();
    const company = document.getElementById('gen-company').value.trim().replace(/\s+/g, '_');
    const selectEl = document.getElementById('gen-unit-select');
    const unitId = selectEl.value;
    const unitName = selectEl.options[selectEl.selectedIndex].getAttribute('data-name').replace(/\s+/g, '_');
    const type = document.getElementById('gen-type').value;

    if (!unitId) return alert("Pilih unit terlebih dahulu!");

    const qrString = `${company}:${unitName}:${type}:${unitId}`;

    document.getElementById('qr-preview-card').classList.remove('d-none');
    document.getElementById('preview-title').textContent = `${selectEl.options[selectEl.selectedIndex].getAttribute('data-name')} (${company})`;
    document.getElementById('preview-badge').textContent = type === 'DARURAT' ? 'QR DARURAT (FORCE CHECKOUT)' : 'QR REGULER';
    document.getElementById('preview-code-string').textContent = qrString;

    const renderBox = document.getElementById('qrcode-render-box');
    renderBox.innerHTML = '';
    if (window.QRCode) {
      new QRCode(renderBox, { text: qrString, width: 150, height: 150 });
    }
  });
}

async function loadScanLogs() {
  const regTbody = document.getElementById('log-reguler-tbody');
  const darTbody = document.getElementById('log-darurat-tbody');
  if (!regTbody || !darTbody) return;

  try {
    const logs = await pb.collection('qr_scan_logs').getFullList({ sort: '-created' }).catch(() => []);
    const regulerLogs = logs.filter(l => l.scan_type === 'REGULER');
    const daruratLogs = logs.filter(l => l.scan_type === 'DARURAT');

    regTbody.innerHTML = regulerLogs.length ? regulerLogs.map(l => `
      <tr>
        <td><small>${l.scanned_at || l.created}</small></td>
        <td><strong>${l.unit_name}</strong></td>
        <td>${l.company}</td>
        <td><span class="badge bg-success-lt">Reguler</span></td>
      </tr>`).join('') : `<tr><td colspan="4" class="text-center text-muted">Belum ada log.</td></tr>`;

    darTbody.innerHTML = daruratLogs.length ? daruratLogs.map(l => `
      <tr>
        <td><small>${l.scanned_at || l.created}</small></td>
        <td><strong>${l.unit_name}</strong></td>
        <td>${l.company}</td>
        <td><span class="badge bg-danger-lt">Darurat</span></td>
      </tr>`).join('') : `<tr><td colspan="4" class="text-center text-muted">Belum ada log.</td></tr>`;
  } catch (err) {}
}

async function loadInventoryData() {
  try {
    rawInventory = await pb.collection('inventory').getFullList({ sort: 'item_name' }).catch(() => []);
    renderInventoryTable(rawInventory);
  } catch (err) {
    const tbody = document.getElementById('inventory-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Collection 'inventory' belum tersedia.</td></tr>`;
  }
}

function renderInventoryTable(items) {
  const tbody = document.getElementById('inventory-table-body');
  const countInv = document.getElementById('count-inventory');
  if (countInv) countInv.textContent = `${items.length} Jenis Barang`;
  if (!tbody) return;

  if (!items.length) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Belum ada data inventaris.</td></tr>`; return; }
  tbody.innerHTML = '';
  items.forEach(i => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${i.item_name}</strong></td>
        <td><span class="badge bg-secondary-lt">${i.category || '-'}</span></td>
        <td class="text-center"><span class="text-success fw-bold fs-3">${i.stock_good ?? 0}</span></td>
        <td class="text-center"><span class="text-warning fw-bold">${i.stock_dirty ?? 0}</span></td>
        <td class="text-center"><span class="text-danger fw-bold">${i.stock_damaged ?? 0}</span></td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-warning me-1" onclick="promptMutasiStok('${i.id}', 'Pakai', 'good', 'dirty')"><i class="ti ti-arrow-right me-1"></i> Pakai</button>
          <button class="btn btn-sm btn-outline-danger" onclick="promptMutasiStok('${i.id}', 'Rusak', 'good', 'damaged')"><i class="ti ti-trash me-1"></i> Rusak</button>
        </td>
        <td>
          <button class="btn btn-outline-primary btn-sm me-1" onclick="editInventory('${i.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteInventory('${i.id}')"><i class="ti ti-trash"></i></button>
        </td>
      </tr>`;
  });
}

async function promptMutasiStok(itemId, actionName, sourceField, targetField) {
  const item = rawInventory.find(x => x.id === itemId);
  if (!item) return;

  const itemName = item.item_name;
  const currentGood = item.stock_good || 0;
  const qtyStr = prompt(`Masukkan jumlah barang "${itemName}" yang ${actionName === 'Pakai' ? 'dipakai' : 'rusak'}:\n(Stok Baik: ${currentGood})`, "1");
  if (!qtyStr) return;
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) return alert("Jumlah tidak valid!");

  if (currentGood < qty) return alert(`❌ Stok Baik tidak mencukupi!`);

  const newSourceVal = currentGood - qty;
  const targetVal = targetField === 'dirty' ? (item.stock_dirty || 0) : (item.stock_damaged || 0);
  const newTargetVal = targetVal + qty;

  const updatePayload = { stock_good: newSourceVal };
  if (targetField === 'dirty') updatePayload.stock_dirty = newTargetVal;
  if (targetField === 'damaged') updatePayload.stock_damaged = newTargetVal;

  try {
    await pb.collection('inventory').update(itemId, updatePayload);
    await pb.collection('inventory_logs').create({
      item_name: itemName,
      action: actionName,
      quantity: qty,
      notes: `Mutasi otomatis ke ${targetField}`
    }).catch(() => {});

    alert(`✅ Stok berhasil diperbarui.`);
    loadInventoryData();
  } catch (err) {
    alert("Gagal mutasi stok: " + err.message);
  }
}

async function loadInventoryLogs() {
  const tbody = document.getElementById('inv-logs-table-body');
  if (!tbody) return;
  try {
    rawInventoryLogs = await pb.collection('inventory_logs').getFullList({ sort: '-created' }).catch(() => []);
    if (!rawInventoryLogs.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Belum ada log.</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    rawInventoryLogs.forEach(l => {
      tbody.innerHTML += `
        <tr>
          <td><small>${l.created ? l.created.replace('T', ' ').substring(0, 16) : '-'}</small></td>
          <td><strong>${l.item_name}</strong></td>
          <td><span class="badge ${l.action === 'Pakai' ? 'bg-warning-lt' : 'bg-danger-lt'}">${l.action}</span></td>
          <td class="text-center"><strong>${l.quantity}</strong></td>
          <td>${l.notes || '-'}</td>
        </tr>`;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Collection belum siap.</td></tr>`;
  }
}

const formInventory = document.getElementById('form-inventory');
if (formInventory) {
  formInventory.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inv-id').value;
    const data = {
      item_name: document.getElementById('inv-name').value.trim(),
      category: document.getElementById('inv-category').value,
      stock_good: parseInt(document.getElementById('inv-good').value) || 0,
      stock_dirty: parseInt(document.getElementById('inv-dirty').value) || 0,
      stock_damaged: parseInt(document.getElementById('inv-damaged').value) || 0,
    };

    try {
      if (id) await pb.collection('inventory').update(id, data);
      else await pb.collection('inventory').create(data);
      formInventory.reset();
      document.getElementById('inv-id').value = '';
      loadInventoryData();
      alert('Inventaris disimpan!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });
}

function editInventory(id) {
  const item = rawInventory.find(i => i.id === id);
  if (!item) return;
  document.getElementById('inv-id').value = item.id;
  document.getElementById('inv-name').value = item.item_name;
  document.getElementById('inv-category').value = item.category;
  document.getElementById('inv-good').value = item.stock_good;
  document.getElementById('inv-dirty').value = item.stock_dirty;
  document.getElementById('inv-damaged').value = item.stock_damaged;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteInventory(id) {
  if (confirm("Hapus barang?")) {
    try { await pb.collection('inventory').delete(id); loadInventoryData(); } catch (err) { alert('Gagal: ' + err.message); }
  }
}

async function loadExpenseData() {
  try {
    rawExpenses = await pb.collection('expense').getFullList({ sort: '-created' }).catch(() => []);
    renderExpenseTable(rawExpenses);
  } catch (err) {}
}

function renderExpenseTable(expenses) {
  const tbody = document.getElementById('expense-table-body');
  const countExp = document.getElementById('count-expenses');
  if (countExp) countExp.textContent = `${expenses.length} Pengeluaran`;
  if (!tbody) return;

  if (!expenses.length) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Belum ada pengeluaran.</td></tr>`; return; }
  tbody.innerHTML = '';
  expenses.forEach(ex => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${ex.description}</strong></td>
        <td><span class="badge bg-warning-lt">${ex.category || '-'}</span></td>
        <td><strong class="text-danger">Rp ${Number(ex.amount || 0).toLocaleString('id-ID')}</strong></td>
        <td><span class="badge bg-light text-dark">${ex.payment_source || '-'}</span></td>
        <td>${ex.petugas || '-'}</td>
        <td><small>${ex.created ? ex.created.replace('T', ' ').substring(0, 16) : '-'}</small></td>
        <td><button class="btn btn-outline-danger btn-sm" onclick="deleteExpense('${ex.id}')"><i class="ti ti-trash"></i></button></td>
      </tr>`;
  });
}

const formExpense = document.getElementById('form-expense');
if (formExpense) {
  formExpense.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      description: document.getElementById('expense-desc').value.trim(),
      category: document.getElementById('expense-category').value,
      amount: parseFloat(document.getElementById('expense-amount').value) || 0,
      payment_source: document.getElementById('expense-source').value.trim(),
      petugas: document.getElementById('expense-petugas').value.trim()
    };
    try {
      await pb.collection('expense').create(data);
      formExpense.reset();
      loadExpenseData();
      alert('Pengeluaran dicatat!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });
}

async function deleteExpense(id) {
  if (confirm("Hapus pengeluaran?")) {
    try { await pb.collection('expense').delete(id); loadExpenseData(); } catch (err) { alert('Gagal: ' + err.message); }
  }
}

function renderBookingTable() {
  const tbody = document.getElementById('booking-table-body');
  const searchBooking = document.getElementById('search-booking');
  if (!tbody) return;

  const searchKey = searchBooking ? searchBooking.value.toLowerCase() : '';
  let filtered = rawBookings.filter(b => (b.guest_name || '').toLowerCase().includes(searchKey) || (b.phone_number || '').includes(searchKey));
  
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Data tidak ditemukan.</td></tr>`; return; }
  tbody.innerHTML = '';
  filtered.forEach(b => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${b.guest_name}</strong><div class="small text-muted">${b.phone_number || '-'}</div></td>
        <td>In: ${b.check_in || '-'}<br><small class="text-muted">Out: ${b.check_out || '-'}</small></td>
        <td><strong>Rp ${Number(b.total_price || 0).toLocaleString('id-ID')}</strong></td>
        <td><span class="text-success fw-bold">Rp ${Number(b.dp_amount || 0).toLocaleString('id-ID')}</span></td>
        <td><span class="text-warning fw-bold">Rp ${Number(b.remaining || 0).toLocaleString('id-ID')}</span></td>
        <td><button class="btn btn-outline-danger btn-sm" onclick="processRefund('${b.id}')"><i class="ti ti-calculator me-1"></i> Refund</button></td>
      </tr>`;
  });
}

// Tambahkan fungsi eksekusi refund di bawahnya
async function processRefund(bookingId) {
  const booking = rawBookings.find(b => b.id === bookingId);
  if (!booking) return alert("Data reservasi tidak ditemukan.");

  const dpMasuk = Number(booking.dp_amount || 0);
  if (dpMasuk <= 0) return alert("Tidak ada dana DP yang masuk untuk direfund.");

  const potonganStr = prompt(`Proses Refund untuk ${booking.guest_name}\nDP Masuk: Rp ${dpMasuk.toLocaleString('id-ID')}\nMasukkan persentase potongan biaya pembatalan (contoh: 10 untuk 10%):`, "0");
  if (potonganStr === null) return;

  const potonganPersen = parseFloat(potonganStr) || 0;
  const jumlahPotongan = (dpMasuk * potonganPersen) / 100;
  const jumlahRefund = dpMasuk - jumlahPotongan;

  if (confirm(`Rincian Kalkulasi Refund:\n- DP Masuk: Rp ${dpMasuk.toLocaleString('id-ID')}\n- Potongan (${potonganPersen}%): Rp ${jumlahPotongan.toLocaleString('id-ID')}\n- Total Dana Direfund: Rp ${jumlahRefund.toLocaleString('id-ID')}\n\nLanjutkan proses refund ini?`)) {
    try {
      await pb.collection('bookings').update(bookingId, { 
        checkout_status: 'Refunded',
        remaining: 0 
      });

      // Catat juga ke data pengeluaran (expense) sebagai arus keluar refund
      await pb.collection('expense').create({
        description: `Refund Dana Reservasi - ${booking.guest_name}`,
        category: 'Lainnya',
        amount: jumlahRefund,
        payment_source: 'Kas Utama / Transfer',
        petugas: pb.authStore.model?.email || 'Admin'
      }).catch(() => {});

      alert("✅ Proses refund berhasil disimpan dan dicatat dalam kas keluar!");
      loadDashboardData();
      loadExpenseData();
    } catch (err) {
      alert("Gagal memproses refund: " + err.message);
    }
}
}
function renderPaymentTable() {
  const tbody = document.getElementById('payment-table-body');
  if (!tbody) return;
  if (!rawPayments.length) { tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Tidak ada transaksi.</td></tr>`; return; }
  tbody.innerHTML = '';
  rawPayments.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td><span class="badge bg-light text-dark">${p.xendit_invoice_id || p.id}</span></td>
        <td><span class="badge bg-blue-lt">${(p.payment_gateway || 'XENDIT').toUpperCase()}</span></td>
        <td><strong>${p.sender_account_name || '-'}</strong><div class="small text-muted">${p.sender_account_number || '-'}</div></td>
        <td><strong class="text-success">Rp ${Number(p.amount || 0).toLocaleString('id-ID')}</strong></td>
        <td><span class="badge bg-success">Lunas</span></td>
      </tr>`;
  });
}

// ================= WHATSAPP ADMIN NOTIFICATION (FIXED LOGIC HAK AKSES) =================
const formWhatsappAdmin = document.getElementById('form-whatsapp-admin');
if (formWhatsappAdmin) {
  formWhatsappAdmin.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('wa-admin-name').value.trim();
    const phone = document.getElementById('wa-admin-phone').value.trim();
    
    // Pastikan nilai boolean checkbox ditangkap dengan benar secara eksplisit (.checked)
    const notifOrder = document.getElementById('wa-admin-order').checked; 
    const notifAlert = document.getElementById('wa-admin-alert').checked; 

    try {
      await pb.collection('admin_notif_wa').create({
        name: name,
        phone_number: phone,
        receive_order_notif: notifOrder, // Bernilai true/false sesuai centangan
        receive_alert_notif: notifAlert  // Bernilai true/false sesuai centangan
      });
      
      this.reset();
      loadWaAdminList(); 
      alert('Hak akses notifikasi WhatsApp admin berhasil disimpan!');
    } catch (error) {
      console.error('Gagal menyimpan:', error);
      alert('Gagal menyimpan data admin: ' + error.message);
    }
  });
}

async function loadWaAdminList() {
  const container = document.getElementById('wa-admin-list');
  if (!container) return;
  try {
    const list = await pb.collection('admin_notif_wa').getFullList({ sort: '-created' });
    if (!list.length) { 
      container.innerHTML = `<div class="col-12"><span class="text-muted small">Belum ada admin terdaftar.</span></div>`; 
      return; 
    }
    container.innerHTML = '';
    list.forEach(adm => {
      // Validasi ketat status boolean true atau false untuk teks badge UI
      const isOrderYes = adm.receive_order_notif === true;
      const isAlertYes = adm.receive_alert_notif === true;

      container.innerHTML += `
        <div class="col-md-6 mb-2">
          <div class="p-3 border rounded bg-white shadow-sm d-flex justify-content-between align-items-center">
            <div>
              <strong><i class="ti ti-user me-1 text-primary"></i>${adm.name}</strong>
              <div class="small text-muted">${adm.phone_number}</div>
              <div class="mt-2">
                <span class="badge ${isOrderYes ? 'bg-success-lt' : 'bg-secondary-lt'} me-1">Notif Pesanan: ${isOrderYes ? 'Ya' : 'Tidak'}</span>
                <span class="badge ${isAlertYes ? 'bg-warning-lt' : 'bg-secondary-lt'}">Alert Satpam: ${isAlertYes ? 'Ya' : 'Tidak'}</span>
              </div>
            </div>
            <button class="btn btn-outline-danger btn-sm" onclick="deleteWaAdmin('${adm.id}')"><i class="ti ti-trash"></i></button>
          </div>
        </div>`;
    });
  } catch (err) {
    container.innerHTML = `<div class="col-12"><span class="text-muted small">Collection 'admin_notif_wa' belum siap atau kosong.</span></div>`;
  }
}

async function deleteWaAdmin(id) {
  if (confirm("Hapus data admin ini?")) {
    try {
      await pb.collection('admin_notif_wa').delete(id);
      loadWaAdminList();
    } catch(err) {
      alert('Gagal menghapus: ' + err.message);
    }
  }
}

const formApiSettings = document.getElementById('form-api-settings');
if (formApiSettings) {
  formApiSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    const xenditSecret = document.getElementById('api-xendit-secret').value.trim();
    const fonnteToken = document.getElementById('api-fonnte-token').value.trim();
    
    try {
      // Ambil seluruh daftar pengaturan yang ada untuk menghindari duplikasi berlapis
      const settingsList = await pb.collection('app_settings').getFullList().catch(() => []);
      
      const payload = { 
        xendit_secret_key: xenditSecret, 
        fonnte_token: fonnteToken 
      };

      if (settingsList.length > 0) {
        // Ambil record pertama sebagai acuan utama
        const primaryRecord = settingsList[0];
        
        // Update record pertama
        await pb.collection('app_settings').update(primaryRecord.id, payload);

        // Jika terlanjur ada data ganda (record ke-2 dan seterusnya), bersihkan otomatis
        if (settingsList.length > 1) {
          for (let i = 1; i < settingsList.length; i++) {
            await pb.collection('app_settings').delete(settingsList[i].id).catch(() => {});
          }
        }
      } else {
        // Jika benar-benar kosong, buat baru
        await pb.collection('app_settings').create(payload);
      }

      alert('API Keys berhasil disimpan dan memperbarui konfigurasi sistem!');
    } catch (err) { 
      alert('Gagal menyimpan API: ' + err.message); 
    }
  });
}

async function loadApiSettings() {
  try {
    const settings = await pb.collection('app_settings').getFirstListItem('').catch(() => null);
    if (settings) {
      const xenditInput = document.getElementById('api-xendit-secret');
      const fonnteInput = document.getElementById('api-fonnte-token');
      
      if (xenditInput && settings.xendit_secret_key) {
        xenditInput.value = settings.xendit_secret_key;
      }
      if (fonnteInput && settings.fonnte_token) {
        fonnteInput.value = settings.fonnte_token;
      }
    }
  } catch (err) {
    console.log("Pengaturan API belum diatur atau collection belum ada.");
  }
}
/**
 * Fungsi untuk mencetak / mendownload QR Code yang digenerate menjadi PDF
 * menggunakan pustaka jsPDF lokal (node_modules/jspdf/dist/jspdf.umd.min.js)
 */
function printGeneratedQr() {
  // 1. Pastikan jsPDF tersedia secara lokal
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Pustaka jsPDF lokal belum dimuat dengan benar di file HTML!");
    return;
  }

  const { jsPDF } = window.jspdf;

  // 2. Ambil wadah atau elemen tempat QR code dirender
  // Sesuaikan id '#qrcode-render-box' jika di HTML Anda menggunakan ID lain
  const renderBox = document.getElementById('qrcode-render-box') || document.getElementById('qrcode');
  
  if (!renderBox) {
    alert("Wadah (container) QR Code tidak ditemukan pada halaman ini!");
    return;
  }

  // Cari elemen canvas atau image di dalam wadah QR
  const qrCanvas = renderBox.querySelector('canvas');
  const qrImg = renderBox.querySelector('img');

  if (!qrCanvas && !qrImg) {
    alert("Belum ada QR Code yang digenerate. Silakan generate QR terlebih dahulu!");
    return;
  }

  // Ambil data gambar QR Code dalam format Base64 / Data URL
  let qrDataUrl = "";
  if (qrCanvas) {
    qrDataUrl = qrCanvas.toDataURL("image/png");
  } else if (qrImg) {
    qrDataUrl = qrImg.src;
  }

  // Ambil teks atau judul pendukung dari elemen teks preview (jika ada, beri nilai aman jika kosong)
  const titleEl = document.getElementById('preview-title') || document.getElementById('qr-title');
  const codeEl = document.getElementById('preview-code-string') || document.getElementById('qr-code-text');

  const previewTitle = titleEl ? titleEl.textContent : "Emergency Master QR";
  const previewString = codeEl ? codeEl.textContent : "KEDUNG-REJEKI-EMERGENCY";

  // 3. Inisialisasi Objek jsPDF (Ukuran A4, Satuan Milimeter)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // 4. Susun Tata Letak (Layout) Halaman PDF
  // --- Header Koperasi / Guest House ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("KEDUNG REJEKI GUEST HOUSE & TRAVEL", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Sistem Manajemen & Kontrol Darurat Terpadu", 105, 26, { align: "center" });

  // Garis Pembatas
  doc.setLineWidth(0.4);
  doc.line(20, 32, 190, 32);

  // --- Informasi Label ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Label: ${previewTitle}`, 105, 43, { align: "center" });

  // --- Gambar QR Code di Tengah ---
  // Parameter: (dataUrl, format, x, y, lebar, tinggi) -> Ukuran 60x60 mm
  doc.addImage(qrDataUrl, "PNG", 75, 52, 60, 60);

  // --- Payload / Teks Kode di Bawah QR ---
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Payload / Data: ${previewString}`, 105, 120, { align: "center" });

  // --- Kotak Instruksi Penggunaan ---
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(30, 128, 150, 22, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text("Instruksi Operasional Darurat:", 35, 135);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("1. Scan QR ini menggunakan pemindai administrator untuk akses darurat.", 35, 141);
  doc.text("2. Jaga kerahasiaan master QR ini dari pihak yang tidak berkepentingan.", 35, 146);

  // --- Footer Dokumen & Timestamp ---
  const timestamp = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'medium'
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(130, 130, 130);
  doc.text(`Dicetak otomatis dari Sistem Lokal Kedung Rejeki pada: ${timestamp}`, 105, 175, { align: "center" });

  // 5. Simpan dan Unduh File PDF
  const safeFilename = previewTitle.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`Master-QR-${safeFilename}-${Date.now()}.pdf`);
}
/**
 * Fungsi Universal untuk mencetak data tabel HTML ke format PDF menggunakan jsPDF
 */
function printTableToPdf(title, subtitle, tableElementId, filename) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Pustaka jsPDF lokal belum dimuat!");
    return;
  }

  const { jsPDF } = window.jspdf;
  const tableEl = document.getElementById(tableElementId);
  
  if (!tableEl) {
    alert("Tabel data tidak ditemukan!");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // --- Header Dokumen ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("KEDUNG REJEKI GUEST HOUSE & TRAVEL", 105, 15, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(title, 105, 22, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(subtitle, 105, 28, { align: "center" });

  doc.setLineWidth(0.3);
  doc.line(15, 33, 195, 33);

  // --- Ekstraksi Data dari Tabel HTML ---
  let rows = [];
  let headers = [];
  
  // Ambil Header Tabel
  const thElements = tableEl.querySelectorAll('thead th');
  thElements.forEach((th, index) => {
    // Abaikan kolom aksi terakhir (misal tombol kelola/hapus)
    if (index < thElements.length - 1 || tableElementId === 'payment-table-body' || tableElementId === 'inv-logs-table-body') {
      headers.push(th.innerText.trim());
    }
  });

  // Ambil Baris Data Tabel
  const trElements = tableEl.querySelectorAll('tbody tr');
  trElements.forEach(tr => {
    const tdElements = tr.querySelectorAll('td');
    if (tdElements.length > 1) { // Abaikan baris "Memuat data..." atau "Kosong"
      let rowData = [];
      tdElements.forEach((td, index) => {
        if (index < tdElements.length - 1 || tableElementId === 'payment-table-body' || tableElementId === 'inv-logs-table-body') {
          // Bersihkan teks dari spasi berlebih atau tag HTML tersembunyi
          rowData.push(td.innerText.replace(/\n/g, ' ').trim());
        }
      });
      rows.push(rowData);
    }
  });

  // Render Tabel sederhana menggunakan jsPDF text coordinate loop
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  let startY = 40;
  
  // Jika menggunakan plugin autoTable bawaan jsPDF (opsional), namun untuk amannya 
  // kita buat rendering baris teks terstruktur rapi agar tidak error jika plugin autoTable belum diimport:
  doc.setFillColor(240, 240, 240);
  doc.rect(15, startY - 5, 180, 8, 'F');
  
  // Cetak header tabel manual secara ringkas
  let headerText = headers.join(" | ");
  doc.text(headerText.substring(0, 95), 18, startY);

  startY += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  rows.forEach((row, idx) => {
    if (startY > 275) { // Halaman baru jika sudah hampir habis
      doc.addPage();
      startY = 20;
    }
    let rowString = row.join(" | ");
    doc.text(rowString.substring(0, 105), 18, startY);
    
    // Garis tipis pemisah baris
    doc.setDrawColor(220, 220, 220);
    doc.line(15, startY + 2, 195, startY + 2);
    
    startY += 7;
  });

  // --- Footer Timestamp ---
  const timestamp = new Date().toLocaleString('id-ID');
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Dicetak pada: ${timestamp}`, 105, 288, { align: "center" });

  // Simpan file
  doc.save(`${filename}-${Date.now()}.pdf`);
}

// --- Fungsi Pemicu Spesifik per Menu ---
function printFinancialReportPdf() {
  const totalRev = document.getElementById('stat-total-revenue')?.textContent || 'Rp 0';
  const totalBook = document.getElementById('stat-total-bookings')?.textContent || '0';
  const sub = `Total Pemasukan: ${totalRev} | Total Reservasi: ${totalBook}`;
  printTableToPdf("Laporan Keuangan & Arus Kas", sub, "booking-table-body", "Laporan-Keuangan");
}

function printPettyCashPdf() {
  const count = document.getElementById('count-expenses')?.textContent || '0';
  printTableToPdf("Laporan Kas Kecil (Petty Cash)", `Total: ${count}`, "expense-table-body", "Kas-Kecil");
}

function printInventoryPdf() {
  const count = document.getElementById('count-inventory')?.textContent || '0';
  printTableToPdf("Laporan Stok Inventaris Barang", `Total Jenis Barang: ${count}`, "inventory-table-body", "Inventaris-Barang");
}

function printBookingsPdf() {
  const count = document.getElementById('count-bookings')?.textContent || '0';
  printTableToPdf("Daftar Reservasi Tamu", `Total: ${count}`, "booking-table-body", "Daftar-Reservasi");
}

function printTransactionsPdf() {
  const count = document.getElementById('count-transactions')?.textContent || '0';
  printTableToPdf("Rincian Transaksi & Gateway", `Total Transaksi: ${count}`, "payment-table-body", "Rincian-Transaksi");
}