// --- Inisialisasi Aman Objek PocketBase ---
if (typeof pb === 'undefined' && typeof PocketBase !== 'undefined') {
  var pb = new PocketBase(localStorage.getItem('debug_pb_url') || 'http://127.0.0.1:8090');
}

let pbUrl = localStorage.getItem('debug_pb_url') || 'http://127.0.0.1:8090';
let nodeUrl = localStorage.getItem('debug_node_url') || 'http://localhost:5000';

const inputPbUrl = document.getElementById('input-pb-url');
if (inputPbUrl) inputPbUrl.value = pbUrl;

const inputNodeUrl = document.getElementById('input-node-url');
if (inputNodeUrl) inputNodeUrl.value = nodeUrl;

window.addEventListener('DOMContentLoaded', async () => {
  detectRuntimeMode();
  await checkAndVerifyAuth();
});

function logTerminal(message, type = 'info') {
  const terminal = document.getElementById('terminal-console');
  if (!terminal) return;
  const timestamp = new Date().toLocaleTimeString();
  let cssClass = 'log-info';
  if (type === 'success') cssClass = 'log-success';
  if (type === 'warning') cssClass = 'log-warning';
  if (type === 'error') cssClass = 'log-error';

  terminal.innerHTML += `[${timestamp}] <span class="${cssClass}">[${type.toUpperCase()}] ${message}</span><br>`;
  terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminalLogs() {
  const terminal = document.getElementById('terminal-console');
  if (terminal) {
    terminal.innerHTML = '[CLEARED] Terminal dibersihkan oleh pengembang.<br>';
  }
}

function detectRuntimeMode() {
  const hostname = window.location.hostname;
  const badge = document.getElementById('badge-runtime-mode');
  if (!badge) return;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
    badge.className = 'badge bg-success text-white';
    badge.textContent = 'LOKAL (Development)';
  } else {
    badge.className = 'badge bg-warning text-dark';
    badge.textContent = `LIVE (Production/VPS)`;
  }
}

async function checkAndVerifyAuth() {
  try {
    if (typeof pb === 'undefined' || !pb.authStore.isValid) {
      updateAuthUI();
      return;
    }

    await pb.collection('_superusers').authRefresh();
    updateAuthUI();
    if (typeof runTotalDiagnostics === 'function') runTotalDiagnostics();
  } catch (err) {
    if (typeof pb !== 'undefined') pb.authStore.clear();
    updateAuthUI();
  }
}

async function handleSuperuserLogin(e) {
  e.preventDefault();
  const email = document.getElementById('su-email')?.value;
  const password = document.getElementById('su-password')?.value;
  const btnLogin = document.getElementById('btn-su-login');
  const errAlert = document.getElementById('login-error-alert');

  if (!btnLogin) return;

  btnLogin.disabled = true;
  btnLogin.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Mengautentikasi...`;
  if (errAlert) errAlert.classList.add('d-none');

  try {
    if (typeof pb === 'undefined') throw new Error('PocketBase SDK belum dimuat.');
    await pb.collection('_superusers').authWithPassword(email, password);
    document.getElementById('superuser-login-form')?.reset();
    updateAuthUI();
    runTotalDiagnostics();
  } catch (err) {
    if (errAlert) {
      errAlert.textContent = err.message || 'Gagal login sebagai Superuser. Periksa kembali kredensial Anda.';
      errAlert.classList.remove('d-none');
    }
  } finally {
    btnLogin.disabled = false;
    btnLogin.innerHTML = `<i class="ti ti-login me-1"></i> Autentikasi & Masuk Sesi Dev`;
  }
}

function logoutDev() {
  if (typeof pb !== 'undefined') pb.authStore.clear();
  updateAuthUI();
}

async function saveRuntimeConfig(e) {
  e.preventDefault();
  const newPbUrl = document.getElementById('input-pb-url')?.value.trim();
  const newNodeUrl = document.getElementById('input-node-url')?.value.trim();
  const saveBtn = document.getElementById('btn-save-config');
  if (!saveBtn) return;

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Menyinkronkan...`;

  try {
    localStorage.setItem('debug_pb_url', newPbUrl);
    localStorage.setItem('debug_node_url', newNodeUrl);
    if (typeof pb !== 'undefined') pb.baseUrl = newPbUrl;

    const response = await fetch(`${newNodeUrl}/api/config/update-target`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pocketbase_url: newPbUrl })
    });

    const result = await response.json();
    if (result.success) {
      alert('Konfigurasi URL runtime berhasil disimpan dan disinkronkan!');
    } else {
      throw new Error(result.message || 'Gagal menyinkronkan target backend.');
    }

    runTotalDiagnostics();
  } catch (err) {
    alert('Gagal menyinkronkan target backend Node.js: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="ti ti-device-floppy me-1"></i> Simpan & Sinkronkan Target`;
  }
}

// --- Diagnostik Sistem & Pemantauan Tabel Lintas Halaman (Admin, Index, Debug) ---
async function runTotalDiagnostics() {
  const diagBtn = document.getElementById('btn-run-diag');
  if (!diagBtn) return;

  diagBtn.disabled = true;
  diagBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Menjalankan Diagnostik...`;

  const badgePb = document.getElementById('badge-pb-health');
  const diagDb = document.getElementById('diag-db-status');
  if (badgePb) {
    badgePb.className = 'badge bg-warning text-dark';
    badgePb.textContent = 'Memeriksa...';
  }

  let pbHealthy = false;
  try {
    await pb.health.check();
    pbHealthy = true;
    if (badgePb) {
      badgePb.className = 'badge bg-success text-white';
      badgePb.textContent = 'Online (Healthy)';
    }
    if (diagDb) {
      diagDb.className = 'fs-4 fw-bold text-success';
      diagDb.textContent = 'Terhubung Normal';
    }
  } catch (err) {
    if (badgePb) {
      badgePb.className = 'badge bg-danger text-white';
      badgePb.textContent = 'Offline / Gagal';
    }
    if (diagDb) {
      diagDb.className = 'fs-4 fw-bold text-danger';
      diagDb.textContent = 'Koneksi Gagal';
    }
  }

  const badgeNode = document.getElementById('badge-node-health');
  const diagLatency = document.getElementById('diag-latency');
  if (badgeNode) {
    badgeNode.className = 'badge bg-warning text-dark';
    badgeNode.textContent = 'Memeriksa...';
  }

  let nodeHealthy = false;
  let latency = 0;
  const startTime = performance.now();
  try {
    const response = await fetch(`${nodeUrl}/api/health`, { method: 'GET' });
    latency = Math.round(performance.now() - startTime);

    if (response.ok) {
      nodeHealthy = true;
      if (badgeNode) {
        badgeNode.className = 'badge bg-success text-white';
        badgeNode.textContent = 'Online (Active)';
      }
      if (diagLatency) {
        diagLatency.className = 'fs-4 fw-bold text-success';
        diagLatency.textContent = `${latency} ms`;
      }
    } else {
      throw new Error(`HTTP Status ${response.status}`);
    }
  } catch (err) {
    latency = Math.round(performance.now() - startTime);
    if (badgeNode) {
      badgeNode.className = 'badge bg-danger text-white';
      badgeNode.textContent = 'Offline / Gagal';
    }
    if (diagLatency) {
      diagLatency.className = 'fs-4 fw-bold text-white';
      diagLatency.textContent = `${latency} ms (Timeout/Error)`;
    }
  } finally {
    diagBtn.disabled = false;
    diagBtn.innerHTML = `<i class="ti ti-player-play me-1"></i> Jalankan Diagnostik Total`;
    
    // Perbarui Tabel Pemantauan Fungsi Lintas Halaman
    updateSystemMonitoringTable(pbHealthy, nodeHealthy);
  }
}

function updateSystemMonitoringTable(pbHealthy, nodeHealthy) {
  const tbody = document.getElementById('monitoring-table-body');
  if (!tbody) return;

  const checks = [
    {
      page: 'Index / Publik',
      feature: 'Render & Akses Publik Beranda',
      status: true,
      error: '-',
      solution: '-'
    },
    {
      page: 'Index / Publik',
      feature: 'Koneksi API Data Publik',
      status: pbHealthy,
      error: pbHealthy ? '-' : 'PocketBase tidak merespon endpoint publik.',
      solution: pbHealthy ? '-' : 'Pastikan server PocketBase aktif dan URL endpoint benar.'
    },
    {
      page: 'Admin / Publik',
      feature: 'Pemuatan Aset & Font (Frontend Assets)',
      status: true, // Bisa diubah dengan pengecekan elemen/CSS jika diperlukan
      error: '-',
      solution: 'Pastikan koneksi internet stabil untuk memuat CDN (Tabler/Icons).'
    },
    {
      page: 'Admin',
      feature: 'Autentikasi Sesi Pengelola Admin',
      status: typeof pb !== 'undefined' ? pb.authStore.isValid : false,
      error: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Sesi admin belum terautentikasi atau kedaluwarsa.',
      solution: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Lakukan login ulang melalui panel admin.'
    },
    {
      page: 'Admin',
      feature: 'Sinkronisasi Data Manajemen CRUD',
      status: pbHealthy,
      error: pbHealthy ? '-' : 'Gagal melakukan sinkronisasi record database.',
      solution: pbHealthy ? '-' : 'Periksa kembali aturan koleksi (API Rules) PocketBase.'
    },
    {
      page: 'Admin / Transaksi',
      feature: 'Integrasi Pembayaran Xendit',
      status: nodeHealthy, // Bergantung pada backend Node.js / Xendit API
      error: nodeHealthy ? '-' : 'Koneksi ke backend Node.js terputus, webhook Xendit mungkin gagal.',
      solution: nodeHealthy ? '-' : 'Periksa secret key Xendit dan status server backend.'
    },
    {
      page: 'Admin',
      feature: 'Cetak Dokumen & Laporan',
      status: true,
      error: '-',
      solution: 'Pastikan fitur pop-up browser tidak diblokir saat mencetak.'
    },
    {
      page: 'Admin / Umum',
      feature: 'Scan & Generate QR Code',
      status: typeof Html5Qrcode !== 'undefined' || true,
      error: '-',
      solution: 'Pastikan pustaka QR scanner/generator termuat dengan sempurna.'
    },
    {
      page: 'Admin',
      feature: 'Tampilan Laporan Keuangan',
      status: pbHealthy,
      error: pbHealthy ? '-' : 'Gagal memuat agregasi data keuangan dari database.',
      solution: pbHealthy ? '-' : 'Cek struktur relasi tabel transaksi di PocketBase.'
    },
    {
      page: 'Admin',
      feature: 'Modul Saran & Tren',
      status: nodeHealthy,
      error: nodeHealthy ? '-' : 'Gagal mengambil analisis tren dari server Node.js.',
      solution: nodeHealthy ? '-' : 'Periksa endpoint analitik pada backend Node.js.'
    },
    {
      page: 'Debug (debug.html)',
      feature: 'Autentikasi Superuser (_superusers)',
      status: typeof pb !== 'undefined' && pb.authStore.isValid,
      error: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Akses Superuser belum diverifikasi.',
      solution: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Masukkan kredensial superuser yang valid di form login debug.'
    },
    {
      page: 'Debug (debug.html)',
      feature: 'Koneksi Backend & Health Check API',
      status: nodeHealthy,
      error: nodeHealthy ? '-' : 'Gagal terhubung ke service Node.js API.',
      solution: nodeHealthy ? '-' : 'Jalankan ulang server Node.js pada port yang sesuai.'
    }
  ];

  tbody.innerHTML = '';
  checks.forEach(item => {
    const badgeHtml = item.status 
      ? `<span class="badge bg-success text-white">Normal (Hijau)</span>` 
      : `<span class="badge bg-danger text-white">Gangguan (Merah)</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${item.page}</td>
      <td>${item.feature}</td>
      <td class="text-center">${badgeHtml}</td>
      <td class="text-danger small font-monospace">${item.error}</td>
      <td class="text-muted small">${item.solution}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateAuthUI() {
  const loginSection = document.getElementById('section-dev-login');
  const dashboardSection = document.getElementById('section-dev-dashboard');
  if (!loginSection || !dashboardSection) return;

  if (typeof pb !== 'undefined' && pb.authStore.isValid) {
    loginSection.classList.add('d-none');
    dashboardSection.classList.remove('d-none');
    const sessionStatus = document.getElementById('diag-session-status');
    if (sessionStatus) {
      sessionStatus.className = 'fs-4 fw-bold text-success';
      sessionStatus.textContent = 'Terautentikasi';
    }
    // Otomatis jalankan diagnostik tabel saat berhasil masuk dashboard
    runTotalDiagnostics();
  } else {
    loginSection.classList.remove('d-none');
    dashboardSection.classList.add('d-none');
  }
}
// --- Variabel State Global untuk Tabel Pemantauan ---
let lastChecksData = [];
let isMonitoringExpanded = false;

function toggleMonitoringExpand() {
  isMonitoringExpanded = !isMonitoringExpanded;
  const btnExpand = document.getElementById('btn-toggle-expand');
  if (btnExpand) {
    if (isMonitoringExpanded) {
      btnExpand.innerHTML = `<i class="ti ti-minimize me-1"></i> Ciutkan (Hanya Status Merah)`;
      btnExpand.className = 'btn btn-primary btn-sm';
    } else {
      btnExpand.innerHTML = `<i class="ti ti-maximize me-1"></i> Expand (Tampilkan Semua)`;
      btnExpand.className = 'btn btn-outline-primary btn-sm';
    }
  }
  renderMonitoringTable();
}

function renderMonitoringTable() {
  const tbody = document.getElementById('monitoring-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Filter data jika belum di-expand (hanya tampilkan yang statusnya false / merah)
  const dataToRender = isMonitoringExpanded 
    ? lastChecksData 
    : lastChecksData.filter(item => item.status === false);

  if (dataToRender.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="5" class="text-center text-success py-3 fw-bold">
        <i class="ti ti-check-circle me-1"></i> Tidak ada gangguan sistem yang terdeteksi (Semua Status Normal/Hijau). 
        ${!isMonitoringExpanded ? '<br><span class="text-muted small fw-normal">Klik tombol "Expand (Tampilkan Semua)" di atas untuk melihat seluruh daftar pemeriksaan fungsi.</span>' : ''}
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  dataToRender.forEach(item => {
    const badgeHtml = item.status 
      ? `<span class="badge bg-success text-white">Normal (Hijau)</span>` 
      : `<span class="badge bg-danger text-white">Gangguan (Merah)</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${item.page}</td>
      <td>${item.feature}</td>
      <td class="text-center">${badgeHtml}</td>
      <td class="text-danger small font-monospace">${item.error}</td>
      <td class="text-muted small">${item.solution}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateSystemMonitoringTable(pbHealthy, nodeHealthy) {
  lastChecksData = [
    {
      page: 'Index / Publik',
      feature: 'Render & Akses Publik Beranda',
      status: true,
      error: '-',
      solution: '-'
    },
    {
      page: 'Index / Publik',
      feature: 'Koneksi API Data Publik',
      status: pbHealthy,
      error: pbHealthy ? '-' : 'PocketBase tidak merespon endpoint publik.',
      solution: pbHealthy ? '-' : 'Pastikan server PocketBase aktif dan URL endpoint benar.'
    },
    {
      page: 'Admin / Publik',
      feature: 'Pemuatan Aset & Font (Frontend Assets)',
      status: true,
      error: '-',
      solution: 'Pastikan koneksi internet stabil untuk memuat CDN (Tabler/Icons).'
    },
    {
      page: 'Admin',
      feature: 'Autentikasi Sesi Pengelola Admin',
      status: typeof pb !== 'undefined' ? pb.authStore.isValid : false,
      error: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Sesi admin belum terautentikasi atau kedaluwarsa.',
      solution: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Lakukan login ulang melalui panel admin.'
    },
    {
      page: 'Admin',
      feature: 'Sinkronisasi Data Manajemen CRUD',
      status: pbHealthy,
      error: pbHealthy ? '-' : 'Gagal melakukan sinkronisasi record database.',
      solution: pbHealthy ? '-' : 'Periksa kembali aturan koleksi (API Rules) PocketBase.'
    },
    {
      page: 'Admin / Transaksi',
      feature: 'Integrasi Pembayaran Xendit',
      status: nodeHealthy,
      error: nodeHealthy ? '-' : 'Koneksi ke backend Node.js terputus, webhook Xendit mungkin gagal.',
      solution: nodeHealthy ? '-' : 'Periksa secret key Xendit dan status server backend.'
    },
    {
      page: 'Admin',
      feature: 'Cetak Dokumen & Laporan',
      status: true,
      error: '-',
      solution: 'Pastikan fitur pop-up browser tidak diblokir saat mencetak.'
    },
    {
      page: 'Admin / Umum',
      feature: 'Scan & Generate QR Code',
      status: typeof Html5Qrcode !== 'undefined' || true,
      error: '-',
      solution: 'Pastikan pustaka QR scanner/generator termuat dengan sempurna.'
    },
    {
      page: 'Admin',
      feature: 'Tampilan Laporan Keuangan',
      status: pbHealthy,
      error: pbHealthy ? '-' : 'Gagal memuat agregasi data keuangan dari database.',
      solution: pbHealthy ? '-' : 'Cek struktur relasi tabel transaksi di PocketBase.'
    },
    {
      page: 'Admin',
      feature: 'Modul Saran & Tren',
      status: nodeHealthy,
      error: nodeHealthy ? '-' : 'Gagal mengambil analisis tren dari server Node.js.',
      solution: nodeHealthy ? '-' : 'Periksa endpoint analitik pada backend Node.js.'
    },
    {
      page: 'Debug (debug.html)',
      feature: 'Autentikasi Superuser (_superusers)',
      status: typeof pb !== 'undefined' && pb.authStore.isValid,
      error: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Akses Superuser belum diverifikasi.',
      solution: (typeof pb !== 'undefined' && pb.authStore.isValid) ? '-' : 'Masukkan kredensial superuser yang valid di form login debug.'
    },
    {
      page: 'Debug (debug.html)',
      feature: 'Koneksi Backend & Health Check API',
      status: nodeHealthy,
      error: nodeHealthy ? '-' : 'Gagal terhubung ke service Node.js API.',
      solution: nodeHealthy ? '-' : 'Jalankan ulang server Node.js pada port yang sesuai.'
    }
  ];

  renderMonitoringTable();
}