// --- Script Blok 3 ---
const pb = new PocketBase('http://127.0.0.1:8090');

    function showPage(pageId) {
      const pageWelcome = document.getElementById('page-welcome');
      const pageCatalog = document.getElementById('page-catalog');
      const pageBooking = document.getElementById('page-booking');
      const pagePayment = document.getElementById('page-payment');

      if (pageWelcome) pageWelcome.classList.add('d-none');
      if (pageCatalog) pageCatalog.classList.add('d-none');
      if (pageBooking) pageBooking.classList.add('d-none');
      if (pagePayment) pagePayment.classList.add('d-none');

      const targetPage = document.getElementById(pageId);
      if (targetPage) {
        targetPage.classList.remove('d-none');
      }

      if (pageId === 'page-catalog') {
        loadCatalog();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // FUNGSI UNTUK MEMBUKA MODAL DEV PANEL
    function openDevPanel() {
      const modalEl = document.getElementById('modal-superuser-auth');
      if (modalEl && window.bootstrap) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
      } else {
        alert('Modal Superuser belum siap.');
      }
    }

    // FUNGSI UNTUK LOGIN SUPERUSER POCKETBASE
    async function handleSuperuserLogin(e) {
      e.preventDefault();
      const email = document.getElementById('su-email').value;
      const password = document.getElementById('su-password').value;
      const errAlert = document.getElementById('login-error-alert');
      
      try {
        errAlert.classList.add('d-none');
        await pb.collection('_superusers').authWithPassword(email, password);
        alert('Autentikasi Superuser berhasil!');
        
        const modalEl = document.getElementById('modal-superuser-auth');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      } catch (err) {
        errAlert.textContent = 'Gagal login: ' + (err.message || 'Kredensial salah');
        errAlert.classList.remove('d-none');
      }
    }

    async function loadCatalog() {
      const container = document.getElementById('catalog-container');
      if (!container) return;

      try {
        const units = await pb.collection('units').getFullList({ sort: 'type' });

        if (units.length === 0) {
          container.innerHTML = `<div class="col-12 text-center text-muted py-5">Belum ada unit yang terdaftar.</div>`;
          return;
        }

        container.innerHTML = '';
        units.forEach(u => {
          const isAvailable = u.status === 'Tersedia';
          const badgeBg = isAvailable ? 'bg-success' : 'bg-danger';
          const statusText = isAvailable ? 'Tersedia' : 'Sewa/Terisi';
          
          const col = document.createElement('div');
          col.className = 'col-md-6 col-lg-4';
          col.innerHTML = `
            <div class="card shadow-sm h-100">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <span class="badge bg-blue-lt text-uppercase">${u.type || 'Unit'}</span>
                  <span class="badge ${badgeBg} text-white">${statusText}</span>
                </div>
                <h3 class="card-title mb-1">${u.name}</h3>
                <div class="text-muted small mb-3">Unit Kedung Rejeki</div>
                
                <div class="display-6 font-weight-bold text-primary mb-3">
                  Rp ${Number(u.price_per_day).toLocaleString('id-ID')} <span class="fs-6 text-muted font-weight-normal">/ hari</span>
                </div>

                <div class="btn-list w-100">
                  ${isAvailable ? `
                    <button type="button" class="btn btn-primary w-100 btn-book-unit" 
                            data-id="${u.id}" data-name="${u.name}" data-price="${u.price_per_day}">
                      <i class="ti ti-calendar-event me-1"></i> Pesan Sekarang
                    </button>
                  ` : `
                    <button class="btn btn-secondary w-100" disabled>
                      <i class="ti ti-circle-x me-1"></i> Sedang Tidak Tersedia
                    </button>
                  `}
                </div>
              </div>
            </div>
          `;

          if (isAvailable) {
            const btnBook = col.querySelector('.btn-book-unit');
            btnBook.addEventListener('click', () => {
              prepareBookingForm({
                id: u.id,
                name: u.name,
                price: u.price_per_day
              });
            });
          }

          container.appendChild(col);
        });

      } catch (err) {
        console.error("Gagal memuat katalog:", err);
        container.innerHTML = `<div class="col-12 text-center text-danger py-5">Gagal memuat katalog: ${err.message}.</div>`;
      }
    }

    function prepareBookingForm(unit) {
      document.getElementById('booking-unit-id').value = unit.id;
      document.getElementById('booking-unit-price-val').value = unit.price;
      
      document.getElementById('display-unit-name').textContent = unit.name;
      document.getElementById('display-unit-price').textContent = `Rp ${Number(unit.price).toLocaleString('id-ID')} / hari`;

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('check_in').value = today;
      document.getElementById('duration').value = 1;

      calculateBookingSummary();
      showPage('page-booking');
    }

    function calculateBookingSummary() {
      const checkInVal = document.getElementById('check_in').value;
      const durationVal = parseInt(document.getElementById('duration').value) || 1;
      const pricePerDay = parseFloat(document.getElementById('booking-unit-price-val').value) || 0;

      if (!checkInVal) return;

      const checkInDate = new Date(checkInVal);
      checkInDate.setDate(checkInDate.getDate() + durationVal);
      const checkOutVal = checkInDate.toISOString().split('T')[0];

      document.getElementById('preview-checkout').textContent = checkOutVal;

      const totalPrice = pricePerDay * durationVal;
      document.getElementById('preview-total-price').textContent = `Rp ${totalPrice.toLocaleString('id-ID')}`;

      const dpAmount = Math.round(totalPrice * 0.3);
      document.getElementById('preview-dp').textContent = `Rp ${dpAmount.toLocaleString('id-ID')}`;

      return {
        check_out: checkOutVal,
        total_price: totalPrice,
        dp_amount: dpAmount,
        remaining: totalPrice - dpAmount
      };
    }

    document.getElementById('check_in').addEventListener('change', calculateBookingSummary);
    document.getElementById('duration').addEventListener('input', calculateBookingSummary);

    document.getElementById('booking-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-booking');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...`;

      try {
        const summary = calculateBookingSummary();
        const formData = {
          unit_id: document.getElementById('booking-unit-id').value,
          guest_name: document.getElementById('guest_name').value,
          phone_number: document.getElementById('phone_number').value,
          id_card: Number(document.getElementById('id_card').value),
          check_in: document.getElementById('check_in').value,
          check_out: summary.check_out,
          total_price: summary.total_price,
          dp_amount: summary.dp_amount,
          remaining: summary.remaining,
          status: 'Pending',
          checkout_status: 'Pending'
        };

        const record = await pb.collection('bookings').create(formData);
        
        document.getElementById('pay-booking-id').value = record.id;
        document.getElementById('pay-booking-id-display').textContent = record.id;
        document.getElementById('pay-total-val').value = summary.total_price;
        document.getElementById('pay-dp-val').value = summary.dp_amount;
        document.getElementById('pay-sender-name').value = formData.guest_name;

        document.getElementById('label-amount-dp').textContent = `Rp ${summary.dp_amount.toLocaleString('id-ID')}`;
        document.getElementById('label-amount-full').textContent = `Rp ${summary.total_price.toLocaleString('id-ID')}`;

        selectPaymentType('dp');
        showPage('page-payment');

        document.getElementById('booking-form').reset();
      } catch (err) {
        alert('Gagal menyimpan reservasi: ' + (err.message || err));
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="ti ti-device-floppy me-1"></i> Simpan & Lanjut Pembayaran`;
      }
    });

    function selectPaymentType(type) {
      const radioDp = document.getElementById('radio-dp');
      const radioFull = document.getElementById('radio-full');
      const cardDp = radioDp.closest('.payment-option-card');
      const cardFull = radioFull.closest('.payment-option-card');

      cardDp.classList.remove('selected');
      cardFull.classList.remove('selected');

      if (type === 'dp') {
        radioDp.checked = true;
        cardDp.classList.add('selected');
      } else {
        radioFull.checked = true;
        cardFull.classList.add('selected');
      }
    }

    async function processPayment() {
      const bookingId = document.getElementById('pay-booking-id').value;
      const paymentType = document.querySelector('input[name="payment_type"]:checked').value;
      const totalVal = parseFloat(document.getElementById('pay-total-val').value) || 0;
      const dpVal = parseFloat(document.getElementById('pay-dp-val').value) || 0;
      
      const selectedMethod = document.getElementById('payment-gateway-select').value;
      const senderName = document.getElementById('pay-sender-name').value.trim();
      const senderNumber = document.getElementById('pay-sender-number').value.trim();

      if (!senderName || !senderNumber) {
        alert('Mohon lengkapi Nama Pemilik dan Nomor Rekening/HP pembayar.');
        return;
      }

      const amountToPay = (paymentType === 'dp') ? dpVal : totalVal;

      const payBtn = document.getElementById('btn-process-payment');
      payBtn.disabled = true;
      payBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Mengalihkan ke Xendit...`;

      try {
        const response = await fetch('http://localhost:5000/api/payment/create-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalID: bookingId,
            amount: amountToPay,
            description: `Pembayaran Reservasi ${bookingId} (${paymentType.toUpperCase()})`
          })
        });

        const result = await response.json();
        const targetUrl = result.invoiceUrl || result.invoice_url;

        if (targetUrl) {
          window.location.href = targetUrl;
        } else if (result.message) {
          alert('Gagal membuat transaksi: ' + result.message);
        } else {
          alert('Gagal mendapatkan link pembayaran dari Xendit.');
        }
      } catch (err) {
        console.error("Gagal menghubungi server backend:", err);
        alert('Gagal terhubung ke server backend Node.js');
      } finally {
        payBtn.disabled = false;
        payBtn.innerHTML = `<i class="ti ti-shield-lock me-1"></i> Proses Pembayaran`;
      }
    }