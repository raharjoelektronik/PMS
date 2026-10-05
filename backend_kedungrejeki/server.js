const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const PORT = process.env.PORT || 5000;

// Variabel menggunakan 'let' agar bisa diubah secara runtime oleh debug.html
let POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

// Global App Settings Cache (Termasuk Toggle WA Gateway Mode)
let appSettings = {
    fonnte_token: process.env.FONNTE_TOKEN || '',
    xendit_secret_key: process.env.XENDIT_SECRET_KEY || '',
    security_wa: '081122334455',
    xendit_callback_token: process.env.XENDIT_CALLBACK_TOKEN || '',
    wa_gateway_mode: 'fonnte' // Pilihan mode: 'fonnte' atau 'local_bot'
};

// ==========================================
// ENDPOINT KONTROL CONFIGURASI DARI DEBUG.HTML
// ==========================================
app.post('/api/config/update-target', (req, res) => {
    try {
        const { pocketbase_url } = req.body;
        if (pocketbase_url) {
            POCKETBASE_URL = pocketbase_url;
            console.log(`[CONFIG UPDATE] Target PocketBase diubah secara runtime ke: ${POCKETBASE_URL}`);
        }
        return res.json({ 
            success: true, 
            message: 'Konfigurasi target server berhasil diperbarui', 
            active_pocketbase_url: POCKETBASE_URL 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
    res.json({
        status: 'active',
        message: 'Server Node.js Kedung Rejeki Backend Active & Optimized.',
        current_pocketbase_target: POCKETBASE_URL,
        wa_gateway_mode: appSettings.wa_gateway_mode,
        timestamp: new Date().toISOString()
    });
});

// HELPER: Ambil Setting Global dari PocketBase & Bersihkan Duplikasi Otomatis
async function loadSettingsFromPocketBase() {
    try {
        const response = await axios.get(`${POCKETBASE_URL}/api/collections/app_settings/records`, { timeout: 8000 });
        const records = response.data.items || [];
        
        if (records.length > 0) {
            // Ambil record pertama sebagai data acuan utama
            const currentSettings = records[0]; 
            appSettings.fonnte_token = currentSettings.fonnte_token || appSettings.fonnte_token;
            appSettings.xendit_secret_key = currentSettings.xendit_secret_key || appSettings.xendit_secret_key;
            appSettings.security_wa = currentSettings.security_wa || appSettings.security_wa;
            appSettings.xendit_callback_token = currentSettings.xendit_callback_token || appSettings.xendit_callback_token;
            
            if (currentSettings.wa_gateway_mode) {
                appSettings.wa_gateway_mode = currentSettings.wa_gateway_mode;
            }
            
            console.log(`[SETTINGS LOADED] Konfigurasi global dimuat. Mode WA Gateway: ${appSettings.wa_gateway_mode}`);

            // HAPUS OTOMATIS JIKA ADA DUPLIKASI RECORD DI POCKETBASE
            if (records.length > 1) {
                console.log(`[SETTINGS CLEANUP] Ditemukan ${records.length - 1} data duplikat app_settings. Membersihkan...`);
                for (let i = 1; i < records.length; i++) {
                    await axios.delete(`${POCKETBASE_URL}/api/collections/app_settings/records/${records[i].id}`, { timeout: 5000 })
                        .catch(err => console.warn(`Gagal menghapus duplikat ID ${records[i].id}:`, err.message));
                }
                console.log(`[SETTINGS CLEANUP] Pembersihan duplikat selesai.`);
            }

        } else {
            console.log('[SETTINGS INFO] Belum ada record app_settings, membuat record default...');
            await axios.post(`${POCKETBASE_URL}/api/collections/app_settings/records`, appSettings, { timeout: 8000 });
        }
    } catch (error) {
        console.warn('[SETTINGS WARNING] Gagal terhubung ke PocketBase saat memuat setting:', error.message);
    }
}

// HELPER: Ambil Daftar Admin WhatsApp Aktif secara Dinamis
async function getActiveAdminPhones() {
    try {
        const response = await axios.get(`${POCKETBASE_URL}/api/collections/admin_notif_wa/records?filter=(is_active=true)`, { timeout: 8000 });
        const admins = response.data.items || [];
        return admins.map(adm => adm.phone_number).filter(Boolean);
    } catch (error) {
        console.warn('[ADMIN WA WARNING] Gagal mengambil daftar admin dari koleksi admin_notif_wa:', error.message);
        return [];
    }
}

// HELPER: Kirim Notifikasi WhatsApp Dinamis Berdasarkan Toggle Database (Fonnte vs Bot Lokal)
async function sendWhatsAppNotification(targetNumber, message, retries = 2) {
    if (!targetNumber) {
        console.log('[WA SKIPPED] Nomor tujuan kosong.');
        return false;
    }

    if (appSettings.wa_gateway_mode === 'fonnte') {
        if (!appSettings.fonnte_token) {
            console.log('[WA SKIPPED] Token Fonnte belum diisi di Pengaturan System.');
            return false;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.post('https://api.fonnte.com/send', {
                    target: targetNumber,
                    message: message
                }, {
                    headers: { 'Authorization': appSettings.fonnte_token },
                    timeout: 10000
                });
                console.log(`[WA FONNTE SUCCESS] Terkirim ke ${targetNumber}:`, response.data);
                return true;
            } catch (error) {
                console.error(`[WA FONNTE ERROR] Percobaan ${attempt} gagal ke ${targetNumber}:`, error.message);
                if (attempt === retries) return false;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } else {
        console.log(`[WA LOCAL BOT] Mode bot lokal aktif untuk nomor ${targetNumber}.`);
        return false;
    }

    return false;
}

// ==========================================
// 1. ENDPOINT PEMBUATAN INVOICE XENDIT
// ==========================================
app.post('/api/payment/create-invoice', async (req, res) => {
    try {
        const { externalID, amount, description } = req.body;

        // Validasi Payload
        if (!externalID || amount === undefined || amount === null) {
            return res.status(400).json({ success: false, message: 'Parameter externalID dan amount wajib diisi.' });
        }
        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Nilai amount harus berupa angka valid lebih dari 0.' });
        }
        if (!appSettings.xendit_secret_key) {
            return res.status(500).json({ success: false, message: 'Xendit Secret Key belum dikonfigurasi di server.' });
        }

        const encodedKey = Buffer.from(appSettings.xendit_secret_key + ':').toString('base64');
        const xenditResponse = await axios.post('https://api.xendit.co/v2/invoices', {
            external_id: externalID,
            amount: Number(amount),
            description: description || 'Pembayaran Reservasi Kedung Rejeki',
            invoice_duration: 86400,
            currency: 'IDR',
            success_redirect_url: `http://localhost:${PORT}`,
            failure_redirect_url: `http://localhost:${PORT}`
        }, {
            headers: {
                'Authorization': `Basic ${encodedKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const invoiceData = xenditResponse.data;
        return res.status(200).json({
            success: true,
            invoiceUrl: invoiceData.invoice_url,
            id: invoiceData.id
        });
    } catch (error) {
        console.error('[XENDIT CREATE INVOICE ERROR]:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
});

// ==========================================
// 2. ENDPOINT WEBHOOK XENDIT PAYMENT
// ==========================================
app.post('/api/xendit-webhook', async (req, res) => {
    try {
        const callbackToken = req.headers['x-callback-token'];
        if (appSettings.xendit_callback_token && callbackToken !== appSettings.xendit_callback_token) {
            return res.status(403).json({ success: false, message: 'Unauthorized callback token' });
        }

        const webhookData = req.body;
        if (!webhookData || !webhookData.external_id || !webhookData.status) {
            return res.status(400).json({ success: false, message: 'Payload webhook tidak valid.' });
        }

        if (webhookData.status === 'PAID' || webhookData.status === 'SETTLED') {
            const bookingId = webhookData.external_id;
            const amountPaid = webhookData.amount;

            let bookingResponse;
            try {
                bookingResponse = await axios.get(`${POCKETBASE_URL}/api/collections/bookings/records/${bookingId}`, { timeout: 8000 });
            } catch (err) {
                return res.status(404).json({ success: false, message: 'Booking not found' });
            }

            const booking = bookingResponse.data;
            let newStatus = 'Lunas';
            let paymentNote = webhookData.payment_method || 'Xendit Invoice';
            
            if (booking.dp_amount && Number(amountPaid) === Number(booking.dp_amount)) {
                newStatus = 'DP Terbayar';
                paymentNote = `DP 30% (${webhookData.payment_method || 'Xendit'})`;
            }

            const updateResponse = await axios.patch(`${POCKETBASE_URL}/api/collections/bookings/records/${bookingId}`, {
                status: newStatus,
                payment_receipt: paymentNote
            }, { timeout: 8000 });

            const updatedBooking = updateResponse.data;

            const guestMessage = `*KEDUNG REJEKI GUEST HOUSE & TRAVEL*\n\n` +
                `Halo *${updatedBooking.guest_name}*,\n` +
                `Pembayaran reservasi Anda telah berhasil dikonfirmasi!\n\n` +
                `*Rincian Transaksi:*\n` +
                `- ID Reservasi: ${updatedBooking.id}\n` +
                `- Status Pembayaran: *${newStatus}*\n` +
                `- Nominal Diterima: Rp ${Number(amountPaid).toLocaleString('id-ID')}\n\n` +
                `Terima kasih telah mempercayakan akomodasi Anda kepada kami!`;

            if (updatedBooking.phone_number) {
                await sendWhatsAppNotification(updatedBooking.phone_number, guestMessage);
            }

            const adminPhones = await getActiveAdminPhones();
            const adminMessage = `*[NOTIF RESERVASI BARU - ${newStatus.toUpperCase()}]*\n\n` +
                `Ada pembayaran masuk:\n` +
                `- Tamu: ${updatedBooking.guest_name} (${updatedBooking.phone_number || '-'})\n` +
                `- Status: ${newStatus}\n` +
                `- Nominal: Rp ${Number(amountPaid).toLocaleString('id-ID')}\n\n` +
                `Cek dashboard admin untuk detail lengkap.`;

            for (const phone of adminPhones) {
                await sendWhatsAppNotification(phone, adminMessage);
            }
        }

        return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } catch (error) {
        console.error('[XENDIT ERROR]', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 3. ENDPOINT UPDATE PENGATURAN SYSTEM
// ==========================================
app.post('/api/settings/update', async (req, res) => {
    try {
        const { fonnte_token, xendit_secret_key, security_wa, xendit_callback_token, wa_gateway_mode } = req.body;

        if (fonnte_token !== undefined) appSettings.fonnte_token = fonnte_token;
        if (xendit_secret_key !== undefined) appSettings.xendit_secret_key = xendit_secret_key;
        if (security_wa !== undefined) appSettings.security_wa = security_wa;
        if (xendit_callback_token !== undefined) appSettings.xendit_callback_token = xendit_callback_token;
        if (wa_gateway_mode !== undefined) appSettings.wa_gateway_mode = wa_gateway_mode;

        try {
            const listRes = await axios.get(`${POCKETBASE_URL}/api/collections/app_settings/records`, { timeout: 8000 });
            const items = listRes.data.items || [];

            if (items.length > 0) {
                const recordId = items[0].id;
                await axios.patch(`${POCKETBASE_URL}/api/collections/app_settings/records/${recordId}`, appSettings, { timeout: 8000 });

                // Bersihkan record duplikat jika ada
                for (let i = 1; i < items.length; i++) {
                    await axios.delete(`${POCKETBASE_URL}/api/collections/app_settings/records/${items[i].id}`, { timeout: 5000 }).catch(() => {});
                }
            } else {
                await axios.post(`${POCKETBASE_URL}/api/collections/app_settings/records`, appSettings, { timeout: 8000 });
            }
        } catch (pbErr) {
            console.warn('[PB SYNC WARNING] Gagal menyimpan pengaturan ke PocketBase:', pbErr.message);
        }

        return res.json({ success: true, message: 'Pengaturan berhasil diperbarui!', data: appSettings });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 4. CRON JOB: DETEKSI LATE CHECK-OUT
// ==========================================
cron.schedule('*/5 * * * *', async () => {
    try {
        const now = new Date();
        const response = await axios.get(`${POCKETBASE_URL}/api/collections/bookings/records?filter=(checkout_status='Checked-In')`, { timeout: 10000 });
        const activeBookings = response.data.items || [];

        for (const booking of activeBookings) {
            if (!booking.check_out) continue;

            const checkoutDateTime = new Date(booking.check_out + "T12:00:00");
            const diffMinutes = Math.floor((now - checkoutDateTime) / (1000 * 60));

            if (diffMinutes > 15 && !booking.late_notified) {
                const alertMessage = `*⚠️ WARNING ALERT LATE CHECK-OUT*\n\n` +
                    `Nama Tamu: ${booking.guest_name} (${booking.phone_number || '-'})\n` +
                    `Jadwal Check-Out: ${booking.check_out} (Pukul 12:00)\n` +
                    `Keterlambatan: *~${diffMinutes} Menit*\n\n` +
                    `Mohon tim Satpam / Resepsionis segera melakukan pengecekan ke kamar terkait.`;

                if (appSettings.security_wa) {
                    await sendWhatsAppNotification(appSettings.security_wa, alertMessage);
                }

                const adminPhones = await getActiveAdminPhones();
                for (const phone of adminPhones) {
                    await sendWhatsAppNotification(phone, alertMessage);
                }

                await axios.patch(`${POCKETBASE_URL}/api/collections/bookings/records/${booking.id}`, {
                    late_notified: true
                }, { timeout: 5000 });
            }
        }
    } catch (error) {
        console.error('[CRON ERROR]', error.message);
    }
});

// ==========================================
// 5. ENDPOINT PENGELOLAAN INVENTORY
// ==========================================
app.post('/api/inventory/update', async (req, res) => {
    try {
        const { id, stock_good, stock_dirty, stock_damaged } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: 'Parameter ID inventory wajib diisi.' });
        }

        const response = await axios.patch(`${POCKETBASE_URL}/api/collections/inventory/records/${id}`, {
            stock_good: Number(stock_good) || 0,
            stock_dirty: Number(stock_dirty) || 0,
            stock_damaged: Number(stock_damaged) || 0
        }, { timeout: 8000 });

        return res.json({ success: true, data: response.data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 6. ENDPOINT PETTY CASH (Koleksi: expense)
// ==========================================
app.post('/api/expense/create', async (req, res) => {
    try {
        const { description, category, amount, payment_source, petugas } = req.body;
        if (!description || !amount) {
            return res.status(400).json({ success: false, message: 'Deskripsi dan jumlah nominal wajib diisi.' });
        }

        const response = await axios.post(`${POCKETBASE_URL}/api/collections/expense/records`, {
            description, 
            category, 
            amount: Number(amount), 
            payment_source, 
            petugas
        }, { timeout: 8000 });

        return res.json({ success: true, data: response.data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 7. ENDPOINT REQUEST & VERIFIKASI OTP REFUND
// ==========================================
app.post('/api/refund/request-otp', async (req, res) => {
    try {
        const { booking_id, payment_id, admin_phone_2 } = req.body;
        if (!booking_id || !admin_phone_2) {
            return res.status(400).json({ success: false, message: 'Parameter booking_id dan admin_phone_2 wajib diisi.' });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const otpRecord = await axios.post(`${POCKETBASE_URL}/api/collections/refund_otps/records`, {
            booking_id,
            payment_id,
            otp_code: otpCode,
            status: 'Active',
            expires_at: expiresAt
        }, { timeout: 8000 });

        const message = `*[IZIN REFUND - KEDUNG REJEKI]*\n\n` +
            `Permohonan refund untuk Booking ID: ${booking_id}\n` +
            `Kode OTP Verifikasi Anda: *${otpCode}*\n\n` +
            `Kode ini berlaku selama 5 menit. Jangan berikan ke siapa pun untuk menghindari fraud.`;

        await sendWhatsAppNotification(admin_phone_2, message);
        return res.json({ success: true, message: 'OTP berhasil dikirim ke Admin 2', recordId: otpRecord.data.id });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/refund/verify-and-execute', async (req, res) => {
    try {
        const { otp_id, entered_otp } = req.body;
        if (!otp_id || !entered_otp) {
            return res.status(400).json({ success: false, message: 'Parameter otp_id dan entered_otp wajib diisi.' });
        }

        const recordRes = await axios.get(`${POCKETBASE_URL}/api/collections/refund_otps/records/${otp_id}`, { timeout: 8000 });
        const otpData = recordRes.data;

        if (otpData.status !== 'Active' || new Date() > new Date(otpData.expires_at)) {
            return res.status(400).json({ success: false, message: 'Kode OTP sudah Kedaluwarsa atau tidak valid.' });
        }
        if (otpData.otp_code !== entered_otp) {
            return res.status(400).json({ success: false, message: 'Kode OTP salah!' });
        }

        await axios.patch(`${POCKETBASE_URL}/api/collections/refund_otps/records/${otp_id}`, {
            status: 'Verified'
        }, { timeout: 8000 });

        return res.json({ success: true, message: 'OTP Terverifikasi! Dana refund diproses via Flip/Xendit.' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ROOT ROUTE
app.get('/', (req, res) => {
    res.send('Server Node.js Kedung Rejeki Backend Active & Optimized.');
});

// MENJALANKAN SERVER
app.listen(PORT, async () => {
    console.log(`==================================================`);
    console.log(`🚀 Kedung Rejeki Server running on port ${PORT}`);
    console.log(`==================================================`);
    
    await loadSettingsFromPocketBase();
});