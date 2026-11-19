/* ================================================================
   NÜBİHAR & ZEHRA YAYINLARI — HIZLI SATIŞ PANELİ
   app.js v4.0 — Üyeliksiz Direkt Giriş + Otomatik Bulut Yedekleme
   Hızlı Satış, İade, Fiş Düzenleme, Excel Toplu Yükleme, Dinamik Rapor
   ================================================================ */

'use strict';

// ================================================================
// GLOBAL STATE
// ================================================================
const State = {
  cloudReady: false,
  cloudStatus: 'local', // 'connected' | 'local' | 'error'
  cart: [],
  discountPct: 0,
  receiptMode: 'sale', // 'sale' | 'return'
  editingReceiptId: null,
  editingReceiptNo: null,
  editingCreatedAt: null,
  paymentType: 'cash',
  currentSection: 'pos',
  currentPubFilter: 'all',
  products: [],
  receipts: [],
  cloudBackups: [],
  lastBarcode: null,
  addToCartAfterSave: false,
  cameraScanner: null,
  currentReceipt: null,
  parsedExcelRows: [],
  returnSourceReceipt: null,
  voiceEnabled: localStorage.getItem('nzpos_voice') === 'true',
  autoCloudSnapshot: localStorage.getItem('nzpos_auto_cloud_snap') !== 'false',
  settings: {
    businessName: 'Nübihar & Zehra Yayınları',
    address: '',
    phone: '',
    thanks: 'Alışverişiniz için teşekkürler!'
  },
  unsubProducts: null,
  unsubReceipts: null
};

const App = {};
window.App = App;

const LOCAL_KEYS = {
  products: 'nzpos_v4_products',
  receipts: 'nzpos_v4_receipts',
  settings: 'nzpos_v4_settings',
  receiptSeq: 'nzpos_v4_receipt_seq',
  returnSeq: 'nzpos_v4_return_seq',
  lastCloudBackup: 'nzpos_v4_last_cloud_backup',
  localBackups: 'nzpos_v4_local_backups',
  rptTemplates: 'nzpos_v4_rpt_templates',
  rptWidgets: 'nzpos_v4_rpt_widgets'
};

const SEED_PRODUCTS = [
  { id: 'p_1', name: 'Mem û Zîn', author: 'Ehmedê Xanî', publisher: 'nübihar', price: 240, barcode: '9786055402013', available: true, notes: '' },
  { id: 'p_2', name: 'Nûbihara Biçûkan', author: 'Ehmedê Xanî', publisher: 'nübihar', price: 160, barcode: '9786055402020', available: true, notes: '' },
  { id: 'p_3', name: 'Dîwana Melayê Cizîrî', author: 'Melayê Cizîrî', publisher: 'nübihar', price: 290, barcode: '9786055402037', available: true, notes: '' },
  { id: 'p_4', name: 'Kürtçe-Türkçe Büyük Sözlük', author: 'Zana Farqînî', publisher: 'nübihar', price: 480, barcode: '9786055402044', available: true, notes: '' },
  { id: 'p_5', name: 'Sözler', author: 'Bediüzzaman Said Nursi', publisher: 'zehra', price: 320, barcode: '9789758529018', available: true, notes: '' },
  { id: 'p_6', name: 'Mektubat', author: 'Bediüzzaman Said Nursi', publisher: 'zehra', price: 275, barcode: '9789758529025', available: true, notes: '' },
  { id: 'p_7', name: 'Lem\'alar', author: 'Bediüzzaman Said Nursi', publisher: 'zehra', price: 260, barcode: '9789758529032', available: true, notes: '' },
  { id: 'p_8', name: 'Tarihçe-i Hayat', author: 'Bediüzzaman Said Nursi', publisher: 'zehra', price: 310, barcode: '9789758529049', available: false, notes: '' }
];

// ================================================================
// LOCAL STORAGE HELPERS
// ================================================================
const LocalDB = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  },
  write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  },
  ensureSeed() {
    if (!localStorage.getItem(LOCAL_KEYS.products)) {
      LocalDB.write(LOCAL_KEYS.products, SEED_PRODUCTS);
    }
    if (!localStorage.getItem(LOCAL_KEYS.receipts)) {
      LocalDB.write(LOCAL_KEYS.receipts, []);
    }
  },
  nextSeq(type = 'sale') {
    const key = type === 'return' ? LOCAL_KEYS.returnSeq : LOCAL_KEYS.receiptSeq;
    const prefix = type === 'return' ? 'İADE-' : 'FİŞ-';
    const next = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
    localStorage.setItem(key, String(next));
    return prefix + String(next).padStart(4, '0');
  }
};

// ================================================================
// SOUND & VOICE
// ================================================================
const Sound = {
  _ctx: null,
  _getCtx() {
    if (!Sound._ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) Sound._ctx = new Ctx();
    }
    return Sound._ctx;
  },
  beep(freq = 1200, dur = 0.08) {
    try {
      const ctx = Sound._getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  },
  success() { Sound.beep(1250, 0.07); },
  warning() { Sound.beep(420, 0.1); setTimeout(() => Sound.beep(330, 0.12), 130); },
  speakPrice(name, price) {
    if (!State.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const val = Number(price) % 1 === 0 ? Number(price) : Number(price).toFixed(2).replace('.', ' virgül ');
      const u = new SpeechSynthesisUtterance(`${name}, ${val} lira`);
      u.lang = 'tr-TR';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  },
  updateToggleUI() {
    const btn = document.getElementById('voice-toggle-btn');
    if (!btn) return;
    btn.classList.toggle('ok', State.voiceEnabled);
    btn.textContent = State.voiceEnabled ? 'Sesli: Açık' : 'Sesli Fiyat';
  }
};

// ================================================================
// THEME (LIGHT DEFAULT LIKE SCREENSHOTS, OPTIONAL DARK)
// ================================================================
const Theme = {
  current: localStorage.getItem('nzpos_theme_v4') || 'light',
  apply(mode) {
    Theme.current = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', Theme.current);
    localStorage.setItem('nzpos_theme_v4', Theme.current);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = Theme.current === 'dark' ? 'Açık' : 'Koyu';
  },
  toggle() { Theme.apply(Theme.current === 'dark' ? 'light' : 'dark'); }
};

// ================================================================
// TOAST & UI HELPERS
// ================================================================
const Toast = {
  show(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, duration);
  },
  success: (m) => Toast.show(m, 'success'),
  error: (m) => Toast.show(m, 'error', 4200),
  warning: (m) => Toast.show(m, 'warning', 3500),
  info: (m) => Toast.show(m, 'info')
};

const UI = {
  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  formatCurrency(val) {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val) || 0) + ' ₺';
  },
  toDate(ts) {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    return new Date(ts);
  },
  formatDateOnly(ts) {
    return UI.toDate(ts).toLocaleDateString('tr-TR');
  },
  formatTimeOnly(ts) {
    return UI.toDate(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  },
  formatDateTime(ts) {
    return `${UI.formatDateOnly(ts)} ${UI.formatTimeOnly(ts)}`;
  },
  toISODate(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  pubBadge(pub) {
    if (pub === 'nübihar') return '<span class="badge badge-nubihar">Nübihar</span>';
    if (pub === 'zehra') return '<span class="badge badge-zehra">Zehra</span>';
    return '<span class="badge badge-other">Diğer</span>';
  },
  pubName(pub) {
    if (pub === 'nübihar') return 'Nübihar Yayınları';
    if (pub === 'zehra') return 'Zehra Yayınları';
    return 'Diğer';
  },
  payName(type) {
    if (type === 'cash') return 'Nakit';
    if (type === 'card') return 'Kart';
    return 'Havale';
  },
  openModal(id) { document.getElementById(id)?.classList.add('active'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('active'); },
  isModalOpen() { return !!document.querySelector('.modal-overlay.active'); },

  navigateTo(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('[data-section]').forEach(el => {
      el.classList.toggle('active', el.dataset.section === section);
    });
    document.getElementById(`section-${section}`)?.classList.add('active');
    State.currentSection = section;

    if (section === 'pos') {
      App.POS.renderTiles();
      if (App.Mobile?.isActive()) {
        App.Mobile.startCamera();
      } else {
        setTimeout(() => document.getElementById('barcode-input')?.focus(), 80);
      }
    } else {
      App.Mobile?.stopCamera();
      if (section === 'receipts') App.Receipts.render();
      else if (section === 'products') App.Products.render();
      else if (section === 'reports') App.Reports.compute();
      else if (section === 'settings') App.Cloud.renderBackupList();
    }
  },

  updateClockAndFooter() {}
};

// ================================================================
// AUTOMATIC CLOUD SYNC & BACKUP (FIREBASE FIRESTORE, ZERO LOGIN)
// ================================================================
let db = null;
let auth = null;

App.Cloud = {
  _snapshotDebounce: null,

  async init() {
    const setupHint = document.getElementById('firebase-setup-hint');
    if (typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured()) {
      State.cloudReady = false;
      State.cloudStatus = 'local';
      if (setupHint) setupHint.style.display = 'block';
      App.Cloud.updateStatusUI();
      return false;
    }

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      auth = firebase.auth();
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

      // Silent background anonymous authentication — zero login screen!
      await auth.signInAnonymously();

      State.cloudReady = true;
      State.cloudStatus = 'connected';
      if (setupHint) setupHint.style.display = 'none';
      App.Cloud.updateStatusUI();

      // Real-time listeners for products & receipts
      State.unsubProducts = db.collection('products').onSnapshot((snap) => {
        State.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        LocalDB.write(LOCAL_KEYS.products, State.products);
        UI.updateClockAndFooter();
        if (State.currentSection === 'pos') App.POS.renderTiles();
        if (State.currentSection === 'products') App.Products.render();
      }, (err) => console.error('Cloud products listener:', err));

      State.unsubReceipts = db.collection('receipts').orderBy('createdAt', 'desc').limit(1000).onSnapshot((snap) => {
        State.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        LocalDB.write(LOCAL_KEYS.receipts, State.receipts.map(r => ({
          ...r, createdAt: UI.toDate(r.createdAt).toISOString()
        })));
        if (State.currentSection === 'receipts') App.Receipts.render();
        if (State.currentSection === 'reports') App.Reports.compute();
      }, (err) => console.error('Cloud receipts listener:', err));

      await App.Settings.load();
      await App.Cloud.loadCloudBackups();
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      State.cloudReady = false;
      State.cloudStatus = 'error';
      if (setupHint) setupHint.style.display = 'block';
      App.Cloud.updateStatusUI();
      Toast.warning('Bulut bağlantısı kurulamadı, yerel modda çalışılıyor. (Firebase Anonim Giriş açık olmalı)');
      return false;
    }
  },

  updateStatusUI() {
    const chip = document.getElementById('cloud-status-chip');
    const badge = document.getElementById('cloud-settings-badge');
    const lastText = document.getElementById('cloud-last-sync-text');
    const lastTs = localStorage.getItem(LOCAL_KEYS.lastCloudBackup);
    const lastLabel = lastTs ? UI.formatDateTime(lastTs) : 'Henüz yok';

    if (State.cloudStatus === 'connected') {
      if (chip) { chip.innerHTML = '<span class="status-dot"></span> Bulut Aktif'; chip.className = 'icon-pill ok'; }
      if (badge) { badge.textContent = 'Buluta Bağlı'; badge.className = 'badge badge-sale'; }
    } else if (State.cloudStatus === 'error') {
      if (chip) { chip.innerHTML = '<span class="status-dot"></span> Bulut Hatası'; chip.className = 'icon-pill warn'; }
      if (badge) { badge.textContent = 'Bağlantı Hatası'; badge.className = 'badge badge-return'; }
    } else {
      if (chip) { chip.innerHTML = '<span class="status-dot"></span> Yerel Mod'; chip.className = 'icon-pill warn'; }
      if (badge) { badge.textContent = 'Yerel Mod'; badge.className = 'badge badge-other'; }
    }

    if (lastText) lastText.textContent = `Son yedek: ${lastLabel}`;
  },

  scheduleAutoBackup(reason = 'auto') {
    if (!State.autoCloudSnapshot) return;
    if (App.Cloud._snapshotDebounce) clearTimeout(App.Cloud._snapshotDebounce);
    App.Cloud._snapshotDebounce = setTimeout(() => {
      App.Cloud.createBackupSnapshot(reason, true);
    }, 1200);
  },

  async createBackupSnapshot(reason = 'manual', silent = false) {
    const nowIso = new Date().toISOString();
    const payload = {
      version: 4,
      createdAt: nowIso,
      businessSettings: State.settings,
      products: State.products,
      receipts: State.receipts.map(r => ({ ...r, createdAt: UI.toDate(r.createdAt).toISOString() }))
    };

    try {
      if (State.cloudReady && db) {
        const jsonStr = JSON.stringify(payload);
        if (jsonStr.length <= 880000) {
          await db.collection('backups').add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            reason,
            productsCount: payload.products.length,
            receiptsCount: payload.receipts.length,
            payloadJson: jsonStr
          });
          // Keep latest 10 cloud snapshots
          const oldSnap = await db.collection('backups').orderBy('createdAt', 'desc').get();
          if (oldSnap.docs.length > 10) {
            const toDelete = oldSnap.docs.slice(10);
            for (const d of toDelete) await d.ref.delete();
          }
          await App.Cloud.loadCloudBackups();
        }
      } else {
        // Store automatic rolling backup in localStorage when cloud isn't configured yet
        const list = LocalDB.read(LOCAL_KEYS.localBackups, []);
        list.unshift({
          id: 'loc_' + Date.now(),
          createdAt: nowIso,
          reason,
          productsCount: payload.products.length,
          receiptsCount: payload.receipts.length,
          payload
        });
        LocalDB.write(LOCAL_KEYS.localBackups, list.slice(0, 8));
        App.Cloud.renderBackupList();
      }

      localStorage.setItem(LOCAL_KEYS.lastCloudBackup, nowIso);
      App.Cloud.updateStatusUI();
      if (!silent) Toast.success(State.cloudReady ? 'Bulut yedeği alındı!' : 'Otomatik yerel yedek alındı!');
    } catch (e) {
      if (!silent) Toast.error('Yedekleme hatası: ' + e.message);
    }
  },

  async loadCloudBackups() {
    if (!State.cloudReady || !db) {
      App.Cloud.renderBackupList();
      return;
    }
    try {
      const snap = await db.collection('backups').orderBy('createdAt', 'desc').limit(10).get();
      State.cloudBackups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      App.Cloud.renderBackupList();
    } catch (_) {}
  },

  renderBackupList() {
    const el = document.getElementById('cloud-backups-list');
    if (!el) return;
    const list = State.cloudReady ? State.cloudBackups : LocalDB.read(LOCAL_KEYS.localBackups, []);
    if (!list.length) {
      el.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Henüz yedek noktası oluşturulmadı. İlk satış veya düzenlemede otomatik oluşacaktır.</div>';
      return;
    }
    const reasonMap = { sale: 'Satış sonrası', return: 'İade sonrası', edit: 'Fiş düzenleme', product: 'Kitap güncelleme', excel: 'Excel yükleme', manual: 'Manuel', auto: 'Otomatik' };
    el.innerHTML = list.map(b => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid var(--border-light); border-radius:6px; background:var(--bg-subtle); font-size:12px; flex-wrap:wrap;">
        <div>
          <strong>${UI.escapeHtml(UI.formatDateTime(b.createdAt))}</strong>
          <span style="color:var(--text-muted); margin-left:8px;">${reasonMap[b.reason] || b.reason} · ${b.productsCount || 0} kitap · ${b.receiptsCount || 0} fiş</span>
        </div>
        <button type="button" class="btn btn-outline btn-sm" onclick="App.Cloud.restoreBackup('${UI.escapeHtml(b.id)}')">Geri Yükle</button>
      </div>
    `).join('');
  },

  async restoreBackup(id) {
    const list = State.cloudReady ? State.cloudBackups : LocalDB.read(LOCAL_KEYS.localBackups, []);
    const item = list.find(b => b.id === id);
    if (!item) return;
    const payload = item.payload || (item.payloadJson ? JSON.parse(item.payloadJson) : null);
    if (!payload) return;

    if (!confirm(`${UI.formatDateTime(item.createdAt)} tarihli yedek geri yüklenecek (${payload.products?.length || 0} kitap, ${payload.receipts?.length || 0} fiş). Devam edilsin mi?`)) return;

    try {
      if (State.cloudReady && db) {
        let added = 0;
        for (const p of (payload.products || [])) {
          const exists = State.products.some(x => (p.barcode && x.barcode === p.barcode) || x.name === p.name);
          if (!exists && p.name) {
            await db.collection('products').add({
              name: p.name, author: p.author || '', publisher: p.publisher || 'other',
              price: Number(p.price) || 0, barcode: p.barcode || null,
              available: p.available !== false, notes: p.notes || null,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            added++;
          }
        }
        Toast.success(`Bulut yedeğinden geri yüklendi (${added} eksik kitap eklendi).`);
      } else {
        if (Array.isArray(payload.products)) LocalDB.write(LOCAL_KEYS.products, payload.products);
        if (Array.isArray(payload.receipts)) LocalDB.write(LOCAL_KEYS.receipts, payload.receipts);
        if (payload.businessSettings) LocalDB.write(LOCAL_KEYS.settings, payload.businessSettings);
        State.products = LocalDB.read(LOCAL_KEYS.products, []);
        State.receipts = LocalDB.read(LOCAL_KEYS.receipts, []);
        App.POS.renderTiles();
        App.Products.render();
        App.Receipts.render();
        Toast.success('Yedek başarıyla geri yüklendi!');
      }
    } catch (e) {
      Toast.error('Geri yükleme hatası: ' + e.message);
    }
  },

  async syncLocalToCloud() {
    if (!State.cloudReady || !db) {
      Toast.warning('Önce js/config.js içine Firebase bilgilerinizi ekleyin (bkz. KURULUM.md).');
      return;
    }
    const localProds = LocalDB.read(LOCAL_KEYS.products, []);
    if (!localProds.length) { Toast.info('Aktarılacak yerel kitap yok.'); return; }
    let added = 0;
    for (const p of localProds) {
      const exists = State.products.some(x => (p.barcode && x.barcode === p.barcode) || x.name === p.name);
      if (!exists && p.name) {
        await db.collection('products').add({
          name: p.name, author: p.author || '', publisher: p.publisher || 'other',
          price: Number(p.price) || 0, barcode: p.barcode || null,
          available: p.available !== false, notes: p.notes || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        added++;
      }
    }
    Toast.success(`${added} yerel kitap buluta aktarıldı!`);
  }
};

// ================================================================
// CAMERA HARDWARE GUARD (ENSURES CAMERA NEVER STAYS ON IN BACKGROUND)
// ================================================================
const CameraGuard = {
  killTracks(containerId = null) {
    try {
      const root = containerId ? document.getElementById(containerId) : document;
      if (!root) return;
      root.querySelectorAll('video').forEach((video) => {
        try { video.pause(); } catch (_) {}
        const stream = video.srcObject;
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach((t) => {
            try { t.stop(); } catch (_) {}
          });
        }
        video.srcObject = null;
      });
    } catch (_) {}
  },

  stopAll() {
    Barcode.closeCamera();
    App.Mobile?.stopCamera();
    CameraGuard.killTracks();
  }
};

// ================================================================
// BARCODE SCANNER (USB + CAMERA)
// ================================================================
const Barcode = {
  _bound: false,
  _usbBuf: '',
  _usbTime: 0,
  _opening: false,
  _cancelOpen: false,

  init() {
    if (Barcode._bound) return;
    Barcode._bound = true;

    const input = document.getElementById('barcode-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = input.value.trim();
        if (code) {
          input.value = '';
          App.POS.handleBarcode(code);
        }
      }
    });

    // Global USB barcode capture while on POS
    document.addEventListener('keydown', (e) => {
      if (State.currentSection !== 'pos' || UI.isModalOpen()) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const now = Date.now();
      if (now - Barcode._usbTime > 120) Barcode._usbBuf = '';
      Barcode._usbTime = now;
      if (e.key === 'Enter' && Barcode._usbBuf.length >= 4) {
        e.preventDefault();
        const code = Barcode._usbBuf.trim();
        Barcode._usbBuf = '';
        App.POS.handleBarcode(code);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        Barcode._usbBuf += e.key;
      }
    });

    // Shut down all cameras immediately when leaving app, locking screen, or switching tabs
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) CameraGuard.stopAll();
    });
    window.addEventListener('pagehide', () => CameraGuard.stopAll());
    window.addEventListener('beforeunload', () => CameraGuard.stopAll());
    document.addEventListener('freeze', () => CameraGuard.stopAll());
  },

  async openCamera(targetInputId = null) {
    if (typeof Html5Qrcode === 'undefined') {
      Toast.error('Kamera kütüphanesi yüklenemedi.');
      return;
    }

    // Stop mobile inline camera first so two cameras never run at once
    await App.Mobile?.stopCamera();
    await Barcode.closeCamera();

    Barcode._opening = true;
    Barcode._cancelOpen = false;

    UI.openModal('camera-modal');
    const reader = document.getElementById('camera-reader');
    if (reader) reader.innerHTML = '';

    const formats = typeof Html5QrcodeSupportedFormats !== 'undefined' ? [
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.QR_CODE
    ] : undefined;

    const scanner = new Html5Qrcode('camera-reader', formats ? { formatsToSupport: formats } : undefined);
    State.cameraScanner = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 250, height: 140 } },
        async (text) => {
          const cleaned = text.trim();
          await Barcode.closeCamera();
          if (targetInputId) {
            document.getElementById(targetInputId).value = cleaned;
            Sound.success();
            Toast.success(`Barkod okundu: ${cleaned}`);
          } else {
            App.POS.handleBarcode(cleaned);
          }
        },
        () => {}
      );
      Barcode._opening = false;
      // If user closed modal or left app while camera was still starting, stop immediately!
      if (Barcode._cancelOpen || document.hidden || !document.getElementById('camera-modal')?.classList.contains('active')) {
        await Barcode.closeCamera();
      }
    } catch (_) {
      Barcode._opening = false;
      await Barcode.closeCamera();
      if (!Barcode._cancelOpen) {
        Toast.error('Kamera açılamadı. HTTPS bağlantı ve kamera izni gerekir.');
      }
    }
  },

  async closeCamera() {
    Barcode._cancelOpen = true;
    UI.closeModal('camera-modal');

    // Kill hardware MediaStream tracks immediately so camera LED turns off right away
    CameraGuard.killTracks('camera-reader');

    const s = State.cameraScanner;
    State.cameraScanner = null;
    if (s) {
      try { await s.stop(); } catch (_) {}
      try { s.clear(); } catch (_) {}
    }

    CameraGuard.killTracks('camera-reader');
    const r = document.getElementById('camera-reader');
    if (r) r.innerHTML = '';
  }
};

// ================================================================
// CART & HIZLI SATIŞ (POS)
// ================================================================
const Cart = {
  addById(id) {
    const p = State.products.find(x => x.id === id);
    if (p) Cart.add(p, 1);
  },

  add(product, qty = 1) {
    const existing = State.cart.find(i => i.productId === product.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      State.cart.push({
        productId: product.id,
        name: product.name,
        author: product.author || '',
        publisher: product.publisher || 'other',
        price: Number(product.price) || 0,
        quantity: qty,
        itemDiscountPct: null
      });
    }
    Sound.success();
    Sound.speakPrice(product.name, product.price);
    App.POS.showLastScanned(product);
    if (product.available === false) {
      Toast.warning(`"${product.name}" durumu "Yok" görünüyor (satışa engel olmadan eklendi).`);
    }
    Cart.render();
    setTimeout(() => document.getElementById('barcode-input')?.focus(), 60);
  },

  remove(productId) {
    State.cart = State.cart.filter(i => i.productId !== productId);
    Cart.render();
  },

  updateQty(productId, delta) {
    const item = State.cart.find(i => i.productId === productId);
    if (!item) return;
    item.quantity = Math.max(1, item.quantity + delta);
    Cart.render();
  },

  setPrice(productId, rawVal) {
    const item = State.cart.find(i => i.productId === productId);
    if (!item) return;
    const v = parseFloat(rawVal);
    if (!isNaN(v) && v >= 0) item.price = v;
    Cart.render();
  },

  setItemDiscount(productId, rawVal) {
    const item = State.cart.find(i => i.productId === productId);
    if (!item) return;
    if (rawVal === '' || rawVal === null) {
      item.itemDiscountPct = null;
    } else {
      const v = parseFloat(rawVal);
      item.itemDiscountPct = isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
    }
    Cart.render();
  },

  setDiscountPct(val) {
    let pct = parseFloat(val);
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    State.discountPct = pct;
    const inp = document.getElementById('discount-pct');
    if (inp && Number(inp.value) !== pct) inp.value = pct;
    document.querySelectorAll('#discount-presets .disc-chip').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.pct) === pct);
    });
    Cart.render();
  },

  getItemPct(item) {
    return item.itemDiscountPct !== null && item.itemDiscountPct !== undefined ? item.itemDiscountPct : State.discountPct;
  },

  getSubtotal() { return State.cart.reduce((s, i) => s + i.price * i.quantity, 0); },
  getTotal() { return State.cart.reduce((s, i) => s + i.price * i.quantity * (1 - Cart.getItemPct(i) / 100), 0); },
  getDiscount() { return Math.max(0, Cart.getSubtotal() - Cart.getTotal()); },

  clear(keepEditing = false) {
    State.cart = [];
    Cart.setDiscountPct(0);
    document.getElementById('last-scan-strip')?.classList.remove('show');
    if (!keepEditing) {
      State.editingReceiptId = null;
      State.editingReceiptNo = null;
      State.editingCreatedAt = null;
      document.getElementById('editing-banner')?.classList.remove('show');
      App.POS.setMode('sale');
    }
    Cart.render();
  },

  render() {
    const tbody = document.getElementById('cart-tbody');
    const hasItems = State.cart.length > 0;
    document.getElementById('pay-btn').disabled = !hasItems;
    document.getElementById('btn-cash-modal').disabled = !hasItems;

    if (!hasItems) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:44px 12px; color:var(--text-muted);">Barkod okutun veya sağdan kitap seçin.</td></tr>`;
    } else {
      tbody.innerHTML = State.cart.map(item => {
        const pct = Cart.getItemPct(item);
        const net = item.price * item.quantity * (1 - pct / 100);
        const customPct = item.itemDiscountPct !== null && item.itemDiscountPct !== undefined ? item.itemDiscountPct : '';
        return `
          <tr>
            <td>
              <div style="font-weight:600;">${UI.escapeHtml(item.name)}</div>
              <div style="font-size:11px; color:var(--text-muted);">${UI.pubName(item.publisher)}${item.author ? ' · ' + UI.escapeHtml(item.author) : ''}</div>
            </td>
            <td>
              <div class="qty-inline">
                <button type="button" class="qty-btn" onclick="Cart.updateQty('${UI.escapeHtml(item.productId)}', -1)">−</button>
                <span style="min-width:20px; text-align:center; font-weight:600;">${item.quantity}</span>
                <button type="button" class="qty-btn" onclick="Cart.updateQty('${UI.escapeHtml(item.productId)}', 1)">+</button>
              </div>
            </td>
            <td>
              <input type="number" class="inline-num" style="width:68px;" min="0" step="0.5" value="${item.price}" onchange="Cart.setPrice('${UI.escapeHtml(item.productId)}', this.value)" title="Birim fiyatı düzenle">
            </td>
            <td>
              <input type="number" class="inline-num" min="0" max="100" placeholder="${State.discountPct}" value="${customPct}" onchange="Cart.setItemDiscount('${UI.escapeHtml(item.productId)}', this.value)" title="Ürüne özel % indirim">
            </td>
            <td style="text-align:right; font-weight:700; color:${State.receiptMode === 'return' ? 'var(--red)' : 'var(--text-primary)'};">
              ${State.receiptMode === 'return' ? '-' : ''}${UI.formatCurrency(net)}
            </td>
            <td style="text-align:center;">
              <button type="button" style="color:var(--red); font-weight:700; padding:2px 6px;" onclick="Cart.remove('${UI.escapeHtml(item.productId)}')" title="Ürünü fişten sil">✕</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    const sub = Cart.getSubtotal();
    const disc = Cart.getDiscount();
    const total = Cart.getTotal();
    const isRet = State.receiptMode === 'return';

    document.getElementById('subtotal-display').textContent = UI.formatCurrency(sub);
    document.getElementById('discount-display').textContent = UI.formatCurrency(disc);
    document.getElementById('total-display').textContent = (isRet && total > 0 ? '-' : '') + UI.formatCurrency(total);
    document.getElementById('grand-box')?.classList.toggle('is-return', isRet);
    document.getElementById('grand-label').textContent = isRet ? 'İade Tutarı' : 'Fiş Tutarı';

    const saveText = State.editingReceiptId
      ? `Kaydet (${State.editingReceiptNo})`
      : (isRet ? 'İadeyi Kaydet' : 'Fişi Kaydet');
    document.getElementById('pay-btn').textContent = saveText;
    App.Mobile?.updateCartUI();
  }
};
window.Cart = Cart;

App.POS = {
  setMode(mode) {
    State.receiptMode = mode === 'return' ? 'return' : 'sale';
    document.getElementById('mode-sale').checked = State.receiptMode === 'sale';
    document.getElementById('mode-return').checked = State.receiptMode === 'return';
    document.getElementById('mode-sale-label').classList.toggle('sale-active', State.receiptMode === 'sale');
    document.getElementById('mode-return-label').classList.toggle('return-active', State.receiptMode === 'return');
    Cart.render();
  },

  setPaymentType(type) {
    State.paymentType = type;
    document.querySelectorAll('#pos-pay-tabs .pay-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.type === type);
    });
  },

  showLastScanned(product) {
    const strip = document.getElementById('last-scan-strip');
    if (!strip) return;
    document.getElementById('lsc-text').innerHTML = `Son eklenen: <strong>${UI.escapeHtml(product.name)}</strong> (${UI.pubName(product.publisher)})`;
    document.getElementById('lsc-price').textContent = UI.formatCurrency(product.price);
    strip.classList.add('show');
  },

  handleBarcode(barcode) {
    const code = String(barcode || '').trim();
    if (!code) return;
    const found = State.products.find(p => p.barcode && String(p.barcode).trim() === code);
    if (found) {
      Cart.add(found, 1);
    } else {
      Sound.warning();
      State.lastBarcode = code;
      document.getElementById('unknown-barcode-display').textContent = code;
      UI.openModal('unknown-barcode-modal');
    }
  },

  renderTiles() {
    const grid = document.getElementById('pos-tiles-grid');
    if (!grid) return;
    const q = (document.getElementById('product-search')?.value || '').trim().toLocaleLowerCase('tr-TR');
    const pub = State.currentPubFilter;

    document.querySelectorAll('.pub-chip-btn').forEach(b => {
      const active = b.dataset.pub === pub;
      b.classList.toggle('btn-primary', active);
      b.classList.toggle('btn-outline', !active);
    });

    let items = [...State.products];
    if (pub !== 'all') items = items.filter(p => p.publisher === pub);
    if (q) {
      items = items.filter(p =>
        (p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.author || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));

    if (!items.length) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted); font-size:12.5px;">Kitap bulunamadı.</div>';
      return;
    }

    grid.innerHTML = items.slice(0, 120).map(p => {
      const cls = p.publisher === 'nübihar' ? 'pub-nubihar' : p.publisher === 'zehra' ? 'pub-zehra' : '';
      return `
        <button type="button" class="book-tile ${cls}" onclick="Cart.addById('${UI.escapeHtml(p.id)}')">
          <div>
            <div class="bt-name" title="${UI.escapeHtml(p.name)}">${UI.escapeHtml(p.name)}</div>
            <div class="bt-meta">${UI.escapeHtml(p.author || UI.pubName(p.publisher))}</div>
          </div>
          <div class="bt-bottom">
            <span class="bt-price">${UI.formatCurrency(p.price)}</span>
            <span class="bt-dot ${p.available === false ? 'off' : 'on'}" title="${p.available === false ? 'Yok' : 'Var'}"></span>
          </div>
        </button>
      `;
    }).join('');
  },

  openCashModal() {
    if (!State.cart.length) return;
    const total = Cart.getTotal();
    const isRet = State.receiptMode === 'return';
    document.getElementById('pm-title').textContent = isRet ? 'İade Ödemesi' : 'Verilen Para / Tahsilat';
    document.getElementById('pm-label').textContent = isRet ? 'İade Tutarı' : 'Fiş Tutarı';
    document.getElementById('pm-amount').textContent = UI.formatCurrency(total);
    document.getElementById('cash-received').value = total.toFixed(2);
    App.POS.selectModalPay(State.paymentType);
    App.POS.calcChange();
    UI.openModal('payment-modal');
    setTimeout(() => { const inp = document.getElementById('cash-received'); inp?.focus(); inp?.select(); }, 100);
  },

  selectModalPay(type) {
    App.POS.setPaymentType(type);
    document.querySelectorAll('[data-modal-pay]').forEach(b => b.classList.toggle('active', b.dataset.modalPay === type));
    document.getElementById('cash-box').style.display = type === 'cash' ? 'block' : 'none';
    App.POS.calcChange();
  },

  calcChange() {
    const total = Cart.getTotal();
    const rec = parseFloat(document.getElementById('cash-received').value) || 0;
    const box = document.getElementById('change-box');
    if (State.paymentType === 'cash' && rec >= total - 0.005) {
      document.getElementById('change-val').textContent = UI.formatCurrency(Math.max(0, rec - total));
      box.style.display = 'flex';
    } else {
      box.style.display = 'none';
    }
  },

  async saveActiveReceipt(fromModal = false) {
    if (!State.cart.length) return;

    const subtotal = Number(Cart.getSubtotal().toFixed(2));
    const total = Number(Cart.getTotal().toFixed(2));
    const discountAmount = Number(Cart.getDiscount().toFixed(2));
    const effectivePct = subtotal > 0 ? Number(((discountAmount / subtotal) * 100).toFixed(1)) : 0;
    const type = State.receiptMode;
    const payType = State.paymentType;

    let cashReceived = null;
    let change = null;
    if (fromModal && payType === 'cash') {
      const rec = parseFloat(document.getElementById('cash-received').value);
      if (isNaN(rec) || rec < total - 0.005) {
        Toast.warning('Verilen nakit tutarı fiş tutarından az olamaz.');
        return;
      }
      cashReceived = Number(rec.toFixed(2));
      change = Number(Math.max(0, cashReceived - total).toFixed(2));
    }

    const items = State.cart.map(i => ({
      productId: i.productId,
      name: i.name,
      author: i.author || '',
      publisher: i.publisher || 'other',
      price: Number(i.price),
      quantity: Number(i.quantity),
      discountPct: Number(Cart.getItemPct(i))
    }));

    try {
      if (State.editingReceiptId) {
        // UPDATE EXISTING RECEIPT (receiptNo, type, createdAt stay immutable)
        const updateData = {
          items,
          subtotal,
          discountPct: effectivePct,
          discountAmount,
          total,
          paymentType: payType,
          cashReceived,
          change
        };
        if (State.cloudReady && db) {
          await db.collection('receipts').doc(State.editingReceiptId).update({
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          State.receipts = State.receipts.map(r => r.id === State.editingReceiptId
            ? { ...r, ...updateData, updatedAt: new Date().toISOString() }
            : r
          );
          LocalDB.write(LOCAL_KEYS.receipts, State.receipts);
        }
        State.currentReceipt = {
          id: State.editingReceiptId,
          receiptNo: State.editingReceiptNo,
          createdAt: State.editingCreatedAt || new Date(),
          ...updateData
        };
        UI.closeModal('payment-modal');
        Toast.success(`${State.editingReceiptNo} güncellendi!`);
        Cart.clear(false);
        App.Cloud.scheduleAutoBackup('edit');
        return;
      }

      // CREATE NEW RECEIPT (SALE OR RETURN)
      const receiptNo = await App.POS.getNextReceiptNo(type);
      const record = {
        receiptNo,
        type,
        originalReceiptNo: null,
        items,
        subtotal,
        discountPct: effectivePct,
        discountAmount,
        total,
        paymentType: payType,
        cashReceived,
        change,
        notes: null,
        createdAt: State.cloudReady && db
          ? firebase.firestore.FieldValue.serverTimestamp()
          : new Date().toISOString()
      };

      if (State.cloudReady && db) {
        const ref = await db.collection('receipts').add(record);
        State.currentReceipt = { id: ref.id, ...record, createdAt: new Date() };
      } else {
        const saved = { id: 'rcpt_' + Date.now(), ...record };
        State.receipts.unshift(saved);
        LocalDB.write(LOCAL_KEYS.receipts, State.receipts);
        State.currentReceipt = saved;
      }

      UI.closeModal('payment-modal');
      Sound.success();
      Toast.success(`${receiptNo} kaydedildi (${UI.formatCurrency(total)})`);
      Cart.clear(false);
      App.Cloud.scheduleAutoBackup(type);
      if (App.AutoUpdate?._pendingReload) {
        setTimeout(() => App.AutoUpdate.applyNow(), 800);
      }
    } catch (e) {
      Toast.error('Fiş kaydedilemedi: ' + e.message);
    }
  },

  async getNextReceiptNo(type = 'sale') {
    if (!State.cloudReady || !db) {
      return LocalDB.nextSeq(type);
    }
    const ref = db.collection('settings').doc('receipts');
    const prefix = type === 'return' ? 'İADE-' : 'FİŞ-';
    const field = type === 'return' ? 'lastReturnNo' : 'lastNo';
    const nextNum = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.exists ? doc.data() : { lastNo: 0, lastReturnNo: 0 };
      const val = (Number(data[field]) || 0) + 1;
      tx.set(ref, { lastNo: Number(data.lastNo) || 0, lastReturnNo: Number(data.lastReturnNo) || 0, [field]: val });
      return val;
    });
    return prefix + String(nextNum).padStart(4, '0');
  }
};

// ================================================================
// RECEIPT PRINTING & RECEIPTS LIST (EDIT, RETURN, DELETE)
// ================================================================
App.ReceiptView = {
  buildHTML(r) {
    const s = State.settings || {};
    const isRet = r.type === 'return';
    const itemsHTML = (r.items || []).map(item => {
      const pct = item.discountPct !== undefined ? item.discountPct : (r.discountPct || 0);
      const net = item.price * item.quantity * (1 - pct / 100);
      return `
        <div style="margin:4px 0;">
          <div style="font-weight:600;">${UI.escapeHtml(item.name)}</div>
          <div class="r-row" style="padding-left:6px;">
            <span>${item.quantity} x ${UI.formatCurrency(item.price)}${pct > 0 ? ` (-%${pct})` : ''}</span>
            <span>${isRet ? '-' : ''}${UI.formatCurrency(net)}</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="receipt-paper">
        <div class="r-center" style="font-weight:700; font-size:13px;">${UI.escapeHtml(s.businessName || 'Nübihar & Zehra Yayınları')}</div>
        ${s.address ? `<div class="r-center" style="font-size:11px;">${UI.escapeHtml(s.address)}</div>` : ''}
        ${s.phone ? `<div class="r-center" style="font-size:11px;">Tel: ${UI.escapeHtml(s.phone)}</div>` : ''}
        <div class="r-center" style="margin-top:4px; font-weight:700;">${isRet ? '*** İADE FİŞİ ***' : 'SATIŞ FİŞİ'}</div>
        <hr class="r-dashed">
        <div class="r-row"><span>Fiş No:</span><strong>${UI.escapeHtml(r.receiptNo)}</strong></div>
        <div class="r-row"><span>Tarih:</span><span>${UI.formatDateOnly(r.createdAt)}</span></div>
        <div class="r-row"><span>Saat:</span><span>${UI.formatTimeOnly(r.createdAt)}</span></div>
        ${r.originalReceiptNo ? `<div class="r-row"><span>İlgili Fiş:</span><span>${UI.escapeHtml(r.originalReceiptNo)}</span></div>` : ''}
        <hr class="r-dashed">
        ${itemsHTML}
        <hr class="r-dashed">
        <div class="r-row"><span>Ara Toplam:</span><span>${UI.formatCurrency(r.subtotal)}</span></div>
        ${(r.discountAmount || 0) > 0 ? `<div class="r-row"><span>İndirim (%${r.discountPct}):</span><span>-${UI.formatCurrency(r.discountAmount)}</span></div>` : ''}
        <div class="r-row r-grand"><span>${isRet ? 'İADE TOPLAMI:' : 'TOPLAM:'}</span><span>${isRet ? '-' : ''}${UI.formatCurrency(r.total)}</span></div>
        <hr class="r-dashed">
        <div class="r-row"><span>Ödeme:</span><span>${UI.payName(r.paymentType)}</span></div>
        ${r.cashReceived !== null && r.cashReceived !== undefined ? `
          <div class="r-row"><span>Verilen:</span><span>${UI.formatCurrency(r.cashReceived)}</span></div>
          <div class="r-row"><span>Para Üstü:</span><span>${UI.formatCurrency(r.change)}</span></div>
        ` : ''}
        <hr class="r-dashed">
        <div class="r-center" style="font-size:10.5px; color:#555;">${UI.escapeHtml(s.thanks || 'Alışverişiniz için teşekkürler!')}</div>
      </div>`;
  },

  view(receipt) {
    if (!receipt) return;
    document.getElementById('receipt-view-content').innerHTML = App.ReceiptView.buildHTML(receipt);
    UI.openModal('receipt-view-modal');
    document.getElementById('print-receipt-btn').onclick = () => App.ReceiptView.print(receipt);
  },

  print(receipt) {
    const frame = document.getElementById('print-frame');
    frame.style.display = 'block';
    frame.innerHTML = App.ReceiptView.buildHTML(receipt);
    window.print();
    setTimeout(() => { frame.style.display = 'none'; frame.innerHTML = ''; }, 400);
  }
};

App.Receipts = {
  getFiltered() {
    let list = [...State.receipts];
    const from = document.getElementById('filter-date-from')?.value;
    const to = document.getElementById('filter-date-to')?.value;
    const typeF = document.getElementById('filter-receipt-type')?.value || 'all';
    const q = (document.getElementById('receipt-search')?.value || '').trim().toLocaleLowerCase('tr-TR');

    if (from) {
      const fd = new Date(from + 'T00:00:00');
      list = list.filter(r => UI.toDate(r.createdAt) >= fd);
    }
    if (to) {
      const td = new Date(to + 'T23:59:59');
      list = list.filter(r => UI.toDate(r.createdAt) <= td);
    }
    if (typeF !== 'all') {
      list = list.filter(r => (r.type || 'sale') === typeF);
    }
    if (q) {
      list = list.filter(r =>
        (r.receiptNo || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.items || []).some(i => (i.name || '').toLocaleLowerCase('tr-TR').includes(q))
      );
    }
    list.sort((a, b) => UI.toDate(b.createdAt) - UI.toDate(a.createdAt));
    return list;
  },

  render() {
    const list = App.Receipts.getFiltered();
    const tbody = document.getElementById('receipts-tbody');

    const sales = list.filter(r => (r.type || 'sale') !== 'return');
    const returns = list.filter(r => r.type === 'return');
    const sumSales = sales.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const sumReturns = returns.reduce((s, r) => s + (Number(r.total) || 0), 0);

    document.getElementById('rec-sum-sales').textContent = UI.formatCurrency(sumSales);
    document.getElementById('rec-sum-sales-cnt').textContent = `${sales.length} satış fişi`;
    document.getElementById('rec-sum-returns').textContent = UI.formatCurrency(sumReturns);
    document.getElementById('rec-sum-returns-cnt').textContent = `${returns.length} iade fişi`;
    document.getElementById('rec-sum-net').textContent = UI.formatCurrency(sumSales - sumReturns);
    document.getElementById('rec-sum-total-cnt').textContent = `${list.length} işlem`;

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:34px; color:var(--text-muted);">Kayıtlı fiş bulunamadı.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(r => {
      const isRet = r.type === 'return';
      const itemSummary = (r.items || []).map(i => `${i.name} (${i.quantity})`).join(', ');
      return `
        <tr>
          <td style="font-family:monospace; font-weight:700; color:var(--primary-text);">${UI.escapeHtml(r.receiptNo)}</td>
          <td>${isRet ? '<span class="badge badge-return">İade</span>' : '<span class="badge badge-sale">Satış</span>'}</td>
          <td style="white-space:nowrap;">${UI.formatDateOnly(r.createdAt)}</td>
          <td style="white-space:nowrap; color:var(--text-secondary);">${UI.formatTimeOnly(r.createdAt)}</td>
          <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${UI.escapeHtml(itemSummary)}">${UI.escapeHtml(itemSummary || '—')}</td>
          <td><span class="badge badge-pay">${UI.payName(r.paymentType)}</span></td>
          <td style="color:var(--yellow);">${(r.discountPct || 0) > 0 ? '%' + r.discountPct : '—'}</td>
          <td style="text-align:right; font-weight:700; color:${isRet ? 'var(--red)' : 'var(--green)'};">${isRet ? '-' : ''}${UI.formatCurrency(r.total)}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button type="button" class="btn btn-outline btn-sm" onclick="App.Receipts.edit('${UI.escapeHtml(r.id)}')">Düzenle</button>
            ${!isRet ? `<button type="button" class="btn btn-warning btn-sm" onclick="App.Receipts.openReturn('${UI.escapeHtml(r.id)}')">İade</button>` : ''}
            <button type="button" class="btn btn-outline btn-sm" onclick="App.ReceiptView.view(State.receipts.find(x=>x.id==='${UI.escapeHtml(r.id)}'))">Yazdır</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="App.Receipts.delete('${UI.escapeHtml(r.id)}')">Sil</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Load saved receipt directly into Hızlı Satış to add/remove items or change prices/discount!
  edit(id) {
    const r = State.receipts.find(x => x.id === id);
    if (!r) return;
    State.editingReceiptId = r.id;
    State.editingReceiptNo = r.receiptNo;
    State.editingCreatedAt = r.createdAt;
    State.cart = (r.items || []).map(i => ({
      productId: i.productId || ('item_' + Math.random().toString(36).slice(2)),
      name: i.name,
      author: i.author || '',
      publisher: i.publisher || 'other',
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1,
      itemDiscountPct: i.discountPct !== undefined ? Number(i.discountPct) : null
    }));
    State.discountPct = Number(r.discountPct) || 0;
    document.getElementById('discount-pct').value = State.discountPct;
    App.POS.setMode(r.type || 'sale');
    App.POS.setPaymentType(r.paymentType || 'cash');
    document.getElementById('editing-banner-text').textContent = `Düzenlenen Fiş: ${r.receiptNo} (${UI.formatDateTime(r.createdAt)})`;
    document.getElementById('editing-banner').classList.add('show');
    Cart.render();
    UI.navigateTo('pos');
    Toast.info(`${r.receiptNo} düzenleme için açıldı. Ürün silebilir, ekleyebilir veya tutarı değiştirebilirsiniz.`);
  },

  openReturn(id) {
    const r = State.receipts.find(x => x.id === id);
    if (!r) return;
    State.returnSourceReceipt = r;
    document.getElementById('return-modal-title').textContent = `İade Al — ${r.receiptNo}`;
    document.getElementById('return-modal-info').textContent = `Tarih: ${UI.formatDateTime(r.createdAt)} · İade edilecek adetleri seçin (0 bırakılanlar iade edilmez):`;

    const tbody = document.getElementById('return-items-tbody');
    tbody.innerHTML = (r.items || []).map((item, idx) => {
      const pct = item.discountPct !== undefined ? item.discountPct : (r.discountPct || 0);
      const unitNet = item.price * (1 - pct / 100);
      return `
        <tr>
          <td>
            <div style="font-weight:600;">${UI.escapeHtml(item.name)}</div>
            <div style="font-size:11px; color:var(--text-muted);">${UI.formatCurrency(unitNet)} / adet</div>
          </td>
          <td>${item.quantity}</td>
          <td>
            <input type="number" class="input ret-qty-input" data-idx="${idx}" min="0" max="${item.quantity}" value="${item.quantity}" style="width:72px; text-align:center; font-weight:700;">
          </td>
          <td style="text-align:right; font-weight:600; color:var(--red);" id="ret-line-${idx}">${UI.formatCurrency(unitNet * item.quantity)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.ret-qty-input').forEach(inp => {
      inp.addEventListener('input', App.Receipts.recalcReturn);
    });
    App.Receipts.recalcReturn();
    UI.openModal('return-modal');
  },

  recalcReturn() {
    const r = State.returnSourceReceipt;
    if (!r) return;
    let total = 0;
    document.querySelectorAll('.ret-qty-input').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      const item = r.items[idx];
      let qty = parseInt(inp.value || '0', 10);
      if (isNaN(qty) || qty < 0) qty = 0;
      if (qty > item.quantity) { qty = item.quantity; inp.value = qty; }
      const pct = item.discountPct !== undefined ? item.discountPct : (r.discountPct || 0);
      const lineNet = item.price * qty * (1 - pct / 100);
      total += lineNet;
      const cell = document.getElementById(`ret-line-${idx}`);
      if (cell) cell.textContent = UI.formatCurrency(lineNet);
    });
    document.getElementById('return-total-display').textContent = UI.formatCurrency(total);
  },

  async confirmReturn() {
    const r = State.returnSourceReceipt;
    if (!r) return;
    const returnItems = [];
    let subtotal = 0;
    let total = 0;

    document.querySelectorAll('.ret-qty-input').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      const qty = parseInt(inp.value || '0', 10) || 0;
      if (qty > 0) {
        const item = r.items[idx];
        const pct = item.discountPct !== undefined ? item.discountPct : (r.discountPct || 0);
        returnItems.push({
          productId: item.productId,
          name: item.name,
          author: item.author || '',
          publisher: item.publisher || 'other',
          price: Number(item.price),
          quantity: qty,
          discountPct: Number(pct)
        });
        subtotal += item.price * qty;
        total += item.price * qty * (1 - pct / 100);
      }
    });

    if (!returnItems.length) {
      Toast.warning('En az 1 ürün için iade adedi girin.');
      return;
    }

    subtotal = Number(subtotal.toFixed(2));
    total = Number(total.toFixed(2));
    const discountAmount = Number(Math.max(0, subtotal - total).toFixed(2));
    const discountPct = subtotal > 0 ? Number(((discountAmount / subtotal) * 100).toFixed(1)) : 0;

    try {
      const receiptNo = await App.POS.getNextReceiptNo('return');
      const record = {
        receiptNo,
        type: 'return',
        originalReceiptNo: r.receiptNo,
        items: returnItems,
        subtotal,
        discountPct,
        discountAmount,
        total,
        paymentType: r.paymentType || 'cash',
        cashReceived: null,
        change: null,
        notes: `${r.receiptNo} nolu fişten iade`,
        createdAt: State.cloudReady && db
          ? firebase.firestore.FieldValue.serverTimestamp()
          : new Date().toISOString()
      };

      if (State.cloudReady && db) {
        await db.collection('receipts').add(record);
      } else {
        State.receipts.unshift({ id: 'ret_' + Date.now(), ...record });
        LocalDB.write(LOCAL_KEYS.receipts, State.receipts);
      }
      UI.closeModal('return-modal');
      App.Receipts.render();
      Toast.success(`İade fişi oluşturuldu: ${receiptNo} (${UI.formatCurrency(total)})`);
      App.Cloud.scheduleAutoBackup('return');
    } catch (e) {
      Toast.error('İade kaydedilemedi: ' + e.message);
    }
  },

  async delete(id) {
    const r = State.receipts.find(x => x.id === id);
    if (!r) return;
    if (!confirm(`${r.receiptNo} (${UI.formatCurrency(r.total)}) fişini kalıcı olarak silmek istiyor musunuz?`)) return;
    try {
      if (State.cloudReady && db) {
        await db.collection('receipts').doc(id).delete();
      } else {
        State.receipts = State.receipts.filter(x => x.id !== id);
        LocalDB.write(LOCAL_KEYS.receipts, State.receipts);
      }
      App.Receipts.render();
      Toast.success(`${r.receiptNo} silindi.`);
      App.Cloud.scheduleAutoBackup('edit');
    } catch (e) {
      Toast.error('Silme hatası: ' + e.message);
    }
  },

  exportExcel() {
    const list = App.Receipts.getFiltered();
    if (!list.length) { Toast.warning('Dışa aktarılacak fiş yok.'); return; }
    const rows = list.map(r => ({
      'Fiş No': r.receiptNo,
      'Tür': r.type === 'return' ? 'İade' : 'Satış',
      'Tarih': UI.formatDateOnly(r.createdAt),
      'Saat': UI.formatTimeOnly(r.createdAt),
      'Ürünler': (r.items || []).map(i => `${i.name} x${i.quantity}`).join('; '),
      'Ödeme': UI.payName(r.paymentType),
      'İndirim %': r.discountPct || 0,
      'İndirim Tutarı': r.discountAmount || 0,
      'Tutar (TL)': r.type === 'return' ? -(Number(r.total) || 0) : (Number(r.total) || 0)
    }));
    App.Excel.downloadSheet(rows, 'Fisler', `fisler_${UI.toISODate(new Date())}.xlsx`);
  }
};

// ================================================================
// PRODUCTS MANAGEMENT & EXCEL BULK IMPORT / EXPORT
// ================================================================
App.Products = {
  render() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;
    const q = (document.getElementById('products-search')?.value || '').trim().toLocaleLowerCase('tr-TR');
    const pub = document.getElementById('products-publisher-filter')?.value || 'all';
    const avail = document.getElementById('products-avail-filter')?.value || 'all';

    let list = [...State.products];
    if (q) {
      list = list.filter(p =>
        (p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.author || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    }
    if (pub !== 'all') list = list.filter(p => p.publisher === pub);
    if (avail === 'available') list = list.filter(p => p.available !== false);
    if (avail === 'unavailable') list = list.filter(p => p.available === false);
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));

    document.getElementById('products-count-label').textContent = `${list.length} / ${State.products.length} kitap`;

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">Kitap bulunamadı.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => {
      const on = p.available !== false;
      return `
        <tr>
          <td>${UI.pubBadge(p.publisher)}</td>
          <td style="font-weight:600;">${UI.escapeHtml(p.name)}</td>
          <td style="color:var(--text-secondary);">${UI.escapeHtml(p.author || '—')}</td>
          <td style="font-family:monospace; font-size:12px; color:var(--text-muted);">${UI.escapeHtml(p.barcode || '—')}</td>
          <td style="text-align:right; font-weight:700;">${UI.formatCurrency(p.price)}</td>
          <td>
            <button type="button" class="badge ${on ? 'badge-sale' : 'badge-return'}" style="cursor:pointer;" onclick="App.Products.toggleAvailable('${UI.escapeHtml(p.id)}')" title="Var/Yok değiştir">
              ${on ? 'Var' : 'Yok'}
            </button>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <button type="button" class="btn btn-outline btn-sm" onclick="App.Products.openEdit('${UI.escapeHtml(p.id)}')">Düzenle</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="App.Products.delete('${UI.escapeHtml(p.id)}')">Sil</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAdd(barcode = '', addToCart = false) {
    State.addToCartAfterSave = addToCart;
    document.getElementById('product-modal-title').textContent = addToCart ? 'Yeni Kitap Ekle & Fişe At' : 'Yeni Kitap Ekle';
    document.getElementById('edit-product-id').value = '';
    document.getElementById('p-name').value = '';
    document.getElementById('p-author').value = '';
    document.getElementById('p-publisher').value = 'nübihar';
    document.getElementById('p-price').value = '';
    document.getElementById('p-barcode').value = barcode;
    document.getElementById('p-available').value = 'true';
    document.getElementById('p-notes').value = '';
    UI.closeModal('unknown-barcode-modal');
    UI.openModal('product-modal');
    setTimeout(() => document.getElementById('p-name')?.focus(), 100);
  },

  openEdit(id) {
    const p = State.products.find(x => x.id === id);
    if (!p) return;
    State.addToCartAfterSave = false;
    document.getElementById('product-modal-title').textContent = 'Kitabı Düzenle';
    document.getElementById('edit-product-id').value = p.id;
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-author').value = p.author || '';
    document.getElementById('p-publisher').value = p.publisher || 'nübihar';
    document.getElementById('p-price').value = p.price ?? '';
    document.getElementById('p-barcode').value = p.barcode || '';
    document.getElementById('p-available').value = String(p.available !== false);
    document.getElementById('p-notes').value = p.notes || '';
    UI.openModal('product-modal');
  },

  async save() {
    const id = document.getElementById('edit-product-id').value;
    const name = document.getElementById('p-name').value.trim();
    const author = document.getElementById('p-author').value.trim(); // Optional!
    const publisher = document.getElementById('p-publisher').value;
    const price = parseFloat(document.getElementById('p-price').value);
    const barcode = document.getElementById('p-barcode').value.trim();
    const available = document.getElementById('p-available').value === 'true';
    const notes = document.getElementById('p-notes').value.trim();

    if (!name) { Toast.warning('Kitap adı zorunludur.'); return; }
    if (isNaN(price) || price < 0) { Toast.warning('Geçerli bir fiyat girin.'); return; }
    if (barcode) {
      const dup = State.products.find(p => p.barcode && p.barcode === barcode && p.id !== id);
      if (dup) { Toast.error(`Bu barkod "${dup.name}" kitabında kayıtlı!`); return; }
    }

    const data = { name, author, publisher, price: Number(price.toFixed(2)), barcode: barcode || null, available, notes: notes || null };

    try {
      let saved = null;
      if (State.cloudReady && db) {
        if (id) {
          await db.collection('products').doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          saved = { id, ...data };
        } else {
          const ref = await db.collection('products').add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          saved = { id: ref.id, ...data };
        }
      } else {
        if (id) {
          State.products = State.products.map(p => p.id === id ? { ...p, ...data } : p);
          saved = { id, ...data };
        } else {
          saved = { id: 'p_' + Date.now(), ...data };
          State.products.push(saved);
        }
        LocalDB.write(LOCAL_KEYS.products, State.products);
        App.Products.render();
        App.POS.renderTiles();
        UI.updateClockAndFooter();
      }
      UI.closeModal('product-modal');
      Toast.success(id ? 'Kitap güncellendi.' : 'Kitap eklendi.');
      App.Cloud.scheduleAutoBackup('product');
      if (State.addToCartAfterSave && saved) {
        State.addToCartAfterSave = false;
        if (App.Mobile?.isActive()) {
          App.Mobile.showProductCard(saved);
        } else {
          Cart.add(saved, 1);
        }
      }
    } catch (e) {
      Toast.error('Kayıt hatası: ' + e.message);
    }
  },

  async toggleAvailable(id) {
    const p = State.products.find(x => x.id === id);
    if (!p) return;
    const next = p.available === false;
    try {
      if (State.cloudReady && db) {
        await db.collection('products').doc(id).update({ available: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      } else {
        p.available = next;
        LocalDB.write(LOCAL_KEYS.products, State.products);
        App.Products.render();
        App.POS.renderTiles();
      }
    } catch (e) { Toast.error('Durum güncellenemedi: ' + e.message); }
  },

  async delete(id) {
    const p = State.products.find(x => x.id === id);
    if (!p || !confirm(`"${p.name}" kitabını silmek istiyor musunuz?`)) return;
    try {
      if (State.cloudReady && db) {
        await db.collection('products').doc(id).delete();
      } else {
        State.products = State.products.filter(x => x.id !== id);
        LocalDB.write(LOCAL_KEYS.products, State.products);
        App.Products.render();
        App.POS.renderTiles();
        UI.updateClockAndFooter();
      }
      Toast.success('Kitap silindi.');
      App.Cloud.scheduleAutoBackup('product');
    } catch (e) { Toast.error('Silme hatası: ' + e.message); }
  },

  async applyBulkPrice() {
    const pub = document.getElementById('bp-publisher').value;
    const pct = parseFloat(document.getElementById('bp-percent').value);
    if (isNaN(pct) || pct === 0 || pct <= -100) { Toast.warning('Geçerli bir yüzde girin.'); return; }
    const targets = State.products.filter(p => pub === 'all' || p.publisher === pub);
    if (!targets.length) { Toast.warning('Kitap bulunamadı.'); return; }
    if (!confirm(`${targets.length} kitabın fiyatı %${pct > 0 ? '+' + pct : pct} güncellensin mi?`)) return;

    const factor = 1 + pct / 100;
    try {
      if (State.cloudReady && db) {
        for (let i = 0; i < targets.length; i += 450) {
          const batch = db.batch();
          targets.slice(i, i + 450).forEach(p => {
            batch.update(db.collection('products').doc(p.id), {
              price: Math.max(0, Math.round(p.price * factor)),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          });
          await batch.commit();
        }
      } else {
        State.products = State.products.map(p => (pub === 'all' || p.publisher === pub)
          ? { ...p, price: Math.max(0, Math.round(p.price * factor)) } : p);
        LocalDB.write(LOCAL_KEYS.products, State.products);
        App.Products.render();
        App.POS.renderTiles();
      }
      UI.closeModal('bulk-price-modal');
      Toast.success(`${targets.length} kitabın fiyatı güncellendi!`);
      App.Cloud.scheduleAutoBackup('product');
    } catch (e) { Toast.error('Hata: ' + e.message); }
  }
};

// ================================================================
// EXCEL (.xlsx / .xls / .csv) BULK IMPORT & EXPORT
// ================================================================
App.Excel = {
  openModal() {
    State.parsedExcelRows = [];
    document.getElementById('excel-preview-area').style.display = 'none';
    document.getElementById('confirm-excel-import-btn').disabled = true;
    document.getElementById('excel-file-input').value = '';
    UI.openModal('excel-import-modal');
  },

  downloadTemplate() {
    const sample = [
      { 'Kitap Adı': 'Mem û Zîn', 'Yazar': 'Ehmedê Xanî', 'Yayınevi': 'Nübihar', 'Fiyat': 240, 'Barkod': '9786055402013', 'Durum': 'Var' },
      { 'Kitap Adı': 'Sözler', 'Yazar': '', 'Yayınevi': 'Zehra', 'Fiyat': 320, 'Barkod': '9789758529018', 'Durum': 'Var' },
      { 'Kitap Adı': 'Örnek Kitap (Yazarsız)', 'Yazar': '', 'Yayınevi': 'Nübihar', 'Fiyat': 150, 'Barkod': '', 'Durum': 'Var' }
    ];
    App.Excel.downloadSheet(sample, 'Kitaplar', 'ornek-kitap-sablonu.xlsx');
    Toast.success('Örnek Excel şablonu indirildi.');
  },

  exportProducts() {
    if (!State.products.length) { Toast.warning('Dışa aktarılacak kitap yok.'); return; }
    const rows = State.products.map(p => ({
      'Kitap Adı': p.name,
      'Yazar': p.author || '',
      'Yayınevi': p.publisher === 'nübihar' ? 'Nübihar' : p.publisher === 'zehra' ? 'Zehra' : 'Diğer',
      'Fiyat': p.price,
      'Barkod': p.barcode || '',
      'Durum': p.available === false ? 'Yok' : 'Var'
    }));
    App.Excel.downloadSheet(rows, 'KitapListesi', `kitaplar_${UI.toISODate(new Date())}.xlsx`);
    Toast.success('Kitap listesi Excel olarak indirildi.');
  },

  downloadSheet(rows, sheetName, fileName) {
    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
      return;
    }
    // Fallback CSV if offline without SheetJS
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.xlsx$/, '.csv');
    a.click();
    URL.revokeObjectURL(url);
  },

  _normKey(k) {
    return String(k || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '');
  },

  _parsePrice(val) {
    if (typeof val === 'number') return val;
    const cleaned = String(val || '').replace(/[^\d.,-]/g, '').trim();
    if (!cleaned) return NaN;
    // Handle Turkish format 1.250,50 -> 1250.50
    if (cleaned.includes(',') && cleaned.includes('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(cleaned.replace(',', '.'));
  },

  _mapPublisher(val, fallback) {
    const s = String(val || '').trim().toLocaleLowerCase('tr-TR');
    if (s.includes('nübihar') || s.includes('nubihar')) return 'nübihar';
    if (s.includes('zehra')) return 'zehra';
    if (s.includes('diğer') || s.includes('diger') || s.includes('other')) return 'other';
    return fallback || 'nübihar';
  },

  async parseFile(file) {
    try {
      let rawRows = [];
      if (typeof XLSX !== 'undefined') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const sep = lines[0]?.includes(';') ? ';' : ',';
        const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());
        rawRows = lines.slice(1).map(line => {
          const cols = line.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
          const obj = {};
          headers.forEach((h, i) => obj[h] = cols[i] ?? '');
          return obj;
        });
      }

      const defaultPub = document.getElementById('excel-default-pub')?.value || 'nübihar';
      const parsed = [];

      rawRows.forEach(row => {
        const map = {};
        Object.keys(row).forEach(k => { map[App.Excel._normKey(k)] = row[k]; });

        const name = String(
          map['kitapadı'] ?? map['kitapadi'] ?? map['kitap'] ?? map['ürünadı'] ?? map['urunadi'] ??
          map['ürün'] ?? map['stokadı'] ?? map['stokadi'] ?? map['ad'] ?? map['adı'] ?? map['name'] ?? map['title'] ?? ''
        ).trim();
        const author = String(
          map['yazar'] ?? map['yazarı'] ?? map['yazari'] ?? map['author'] ?? map['müellif'] ?? ''
        ).trim();
        const priceRaw = map['fiyat'] ?? map['fiyatı'] ?? map['fiyati'] ?? map['satışfiyatı'] ?? map['tutar'] ?? map['price'] ?? map['ücret'];
        const price = App.Excel._parsePrice(priceRaw);
        const barcode = String(
          map['barkod'] ?? map['isbn'] ?? map['barcode'] ?? map['kod'] ?? map['ürünkodu'] ?? ''
        ).trim();
        const pubRaw = map['yayınevi'] ?? map['yayinevi'] ?? map['yayın'] ?? map['publisher'] ?? map['grup'] ?? '';
        const availRaw = String(map['durum'] ?? map['mevcut'] ?? map['var'] ?? '').trim().toLocaleLowerCase('tr-TR');
        const available = !['yok', 'hayır', 'hayir', 'false', '0', 'pasif'].includes(availRaw);

        if (name && !isNaN(price) && price >= 0) {
          parsed.push({
            name,
            author,
            publisher: App.Excel._mapPublisher(pubRaw, defaultPub),
            price: Number(price.toFixed(2)),
            barcode: barcode || null,
            available,
            notes: null
          });
        }
      });

      State.parsedExcelRows = parsed;
      const area = document.getElementById('excel-preview-area');
      const summary = document.getElementById('excel-preview-summary');
      const tbody = document.getElementById('excel-preview-tbody');
      const btn = document.getElementById('confirm-excel-import-btn');

      if (!parsed.length) {
        Toast.warning('Dosyada geçerli "Kitap Adı" ve "Fiyat" satırı bulunamadı.');
        area.style.display = 'none';
        btn.disabled = true;
        return;
      }

      summary.textContent = `${parsed.length} geçerli kitap bulundu (ilk 25 satır önizleniyor):`;
      tbody.innerHTML = parsed.slice(0, 25).map(p => `
        <tr>
          <td style="font-weight:600;">${UI.escapeHtml(p.name)}</td>
          <td>${UI.escapeHtml(p.author || '—')}</td>
          <td>${UI.pubBadge(p.publisher)}</td>
          <td style="font-family:monospace;">${UI.escapeHtml(p.barcode || '—')}</td>
          <td style="text-align:right; font-weight:600;">${UI.formatCurrency(p.price)}</td>
        </tr>
      `).join('');
      area.style.display = 'block';
      btn.disabled = false;
      btn.textContent = `${parsed.length} Kitabı Yükle`;
    } catch (e) {
      Toast.error('Excel okuma hatası: ' + e.message);
    }
  },

  async confirmImport() {
    const rows = State.parsedExcelRows;
    if (!rows.length) return;
    const updateExisting = document.getElementById('excel-update-existing')?.checked;
    const btn = document.getElementById('confirm-excel-import-btn');
    btn.disabled = true;
    btn.textContent = 'Yükleniyor...';

    let added = 0;
    let updated = 0;

    try {
      if (State.cloudReady && db) {
        const existingList = [...State.products];
        for (let i = 0; i < rows.length; i += 400) {
          const batch = db.batch();
          rows.slice(i, i + 400).forEach(item => {
            const match = existingList.find(p =>
              (item.barcode && p.barcode && p.barcode === item.barcode) ||
              (!item.barcode && p.name.toLocaleLowerCase('tr-TR') === item.name.toLocaleLowerCase('tr-TR') && p.publisher === item.publisher)
            );
            if (match) {
              if (updateExisting) {
                batch.update(db.collection('products').doc(match.id), {
                  price: item.price,
                  author: item.author || match.author || '',
                  available: item.available,
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                updated++;
              }
            } else {
              const ref = db.collection('products').doc();
              batch.set(ref, {
                ...item,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              added++;
            }
          });
          await batch.commit();
        }
      } else {
        rows.forEach((item, idx) => {
          const match = State.products.find(p =>
            (item.barcode && p.barcode && p.barcode === item.barcode) ||
            (!item.barcode && p.name.toLocaleLowerCase('tr-TR') === item.name.toLocaleLowerCase('tr-TR') && p.publisher === item.publisher)
          );
          if (match) {
            if (updateExisting) {
              match.price = item.price;
              if (item.author) match.author = item.author;
              match.available = item.available;
              updated++;
            }
          } else {
            State.products.push({ id: `imp_${Date.now()}_${idx}`, ...item });
            added++;
          }
        });
        LocalDB.write(LOCAL_KEYS.products, State.products);
        App.Products.render();
        App.POS.renderTiles();
        UI.updateClockAndFooter();
      }

      UI.closeModal('excel-import-modal');
      Toast.success(`Toplu yükleme tamamlandı: ${added} yeni kitap eklendi, ${updated} kitap güncellendi.`);
      App.Cloud.scheduleAutoBackup('excel');
    } catch (e) {
      Toast.error('Yükleme hatası: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Kitapları Yükle';
    }
  }
};

// ================================================================
// DYNAMIC REPORTS (EXPLICIT DATE RANGE + CUSTOMIZABLE BLOCKS)
// ================================================================
App.Reports = {
  _lastGrouped: [],
  _lastFiltered: [],
  _lastMeta: {},

  setQuickPeriod(period) {
    const now = new Date();
    const fromEl = document.getElementById('rpt-date-from');
    const toEl = document.getElementById('rpt-date-to');
    if (period === 'today') {
      fromEl.value = UI.toISODate(now);
      toEl.value = UI.toISODate(now);
    } else if (period === 'week') {
      fromEl.value = UI.toISODate(new Date(Date.now() - 6 * 86400000));
      toEl.value = UI.toISODate(now);
    } else if (period === 'month') {
      fromEl.value = UI.toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
      toEl.value = UI.toISODate(now);
    } else if (period === 'year') {
      fromEl.value = UI.toISODate(new Date(now.getFullYear(), 0, 1));
      toEl.value = UI.toISODate(now);
    } else {
      fromEl.value = '';
      toEl.value = '';
    }
    App.Reports.compute();
  },

  getWidgets() {
    return LocalDB.read(LOCAL_KEYS.rptWidgets, { summary: true, grouped: true, publisher: true, payment: true, topbooks: true, details: false });
  },

  applyWidgets() {
    const map = App.Reports.getWidgets();
    document.querySelectorAll('#rpt-widget-toggles input[type="checkbox"]').forEach(cb => {
      const k = cb.dataset.widget;
      const on = map[k] !== false && (k !== 'details' || map[k] === true);
      cb.checked = on;
      cb.closest('.toggle-chip')?.classList.toggle('checked', on);
      const blk = document.getElementById(`rpt-block-${k}`);
      if (blk) blk.style.display = on ? '' : 'none';
    });
  },

  compute() {
    App.Reports.applyWidgets();
    App.Reports.renderTemplates();

    const fromStr = document.getElementById('rpt-date-from')?.value;
    const toStr = document.getElementById('rpt-date-to')?.value;
    const pubF = document.getElementById('rpt-filter-pub')?.value || 'all';
    const payF = document.getElementById('rpt-filter-pay')?.value || 'all';
    const typeF = document.getElementById('rpt-filter-type')?.value || 'all';
    const groupBy = document.getElementById('rpt-group-by')?.value || 'day';

    const startDate = fromStr ? new Date(fromStr + 'T00:00:00') : null;
    const endDate = toStr ? new Date(toStr + 'T23:59:59') : null;

    const filtered = [];
    State.receipts.forEach(r => {
      const d = UI.toDate(r.createdAt);
      const rType = r.type === 'return' ? 'return' : 'sale';
      if (startDate && d < startDate) return;
      if (endDate && d > endDate) return;
      if (payF !== 'all' && r.paymentType !== payF) return;
      if (typeF !== 'all' && rType !== typeF) return;

      const items = (r.items || []).filter(i => {
        if (pubF === 'all') return true;
        const pk = i.publisher === 'nübihar' ? 'nübihar' : i.publisher === 'zehra' ? 'zehra' : 'other';
        return pk === pubF;
      });
      if (pubF !== 'all' && !items.length) return;

      let amt = Number(r.total) || 0;
      let disc = Number(r.discountAmount) || 0;
      if (pubF !== 'all') {
        amt = 0; disc = 0;
        items.forEach(i => {
          const pct = i.discountPct !== undefined ? i.discountPct : (r.discountPct || 0);
          const sub = i.price * i.quantity;
          amt += sub * (1 - pct / 100);
          disc += sub * (pct / 100);
        });
      }
      const sign = rType === 'return' ? -1 : 1;
      const qty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      filtered.push({ ...r, _date: d, _type: rType, _sign: sign, _items: items, _amt: amt, _signedAmt: amt * sign, _disc: disc * sign, _qty: qty * sign });
    });

    const grossSales = filtered.filter(r => r._type === 'sale').reduce((s, r) => s + r._amt, 0);
    const totalReturns = filtered.filter(r => r._type === 'return').reduce((s, r) => s + r._amt, 0);
    const netSales = grossSales - totalReturns;
    const netBooks = filtered.reduce((s, r) => s + r._qty, 0);
    const totalDisc = filtered.filter(r => r._type === 'sale').reduce((s, r) => s + r._disc, 0);

    document.getElementById('rpt-net').textContent = UI.formatCurrency(netSales);
    document.getElementById('rpt-gross').textContent = UI.formatCurrency(grossSales);
    document.getElementById('rpt-returns').textContent = UI.formatCurrency(totalReturns);
    document.getElementById('rpt-count').textContent = filtered.length;
    document.getElementById('rpt-books').textContent = netBooks;
    document.getElementById('rpt-discounts').textContent = UI.formatCurrency(totalDisc);

    const rangeLabel = (fromStr || toStr) ? `${fromStr || '...'} — ${toStr || '...'}` : 'Tüm Tarihler';
    document.getElementById('rpt-active-summary').textContent = `${rangeLabel} · ${filtered.length} işlem`;

    // Grouped Table
    const labels = {
      day: { title: 'Günlük Kırılım', col: 'Tarih' },
      month: { title: 'Aylık Kırılım', col: 'Ay' },
      publisher: { title: 'Yayınevi Kırılımı', col: 'Yayınevi' },
      payment: { title: 'Ödeme Tipi Kırılımı', col: 'Ödeme Tipi' },
      book: { title: 'Kitap Kırılımı', col: 'Kitap' }
    };
    const meta = labels[groupBy] || labels.day;
    document.getElementById('rpt-grouped-title').textContent = meta.title;
    document.getElementById('rpt-grouped-col-label').textContent = meta.col;

    const groups = {};
    const addG = (k, label, cnt, qty, disc, net, sortKey) => {
      if (!groups[k]) groups[k] = { label, count: 0, qty: 0, discount: 0, net: 0, sortKey: sortKey || label };
      groups[k].count += cnt;
      groups[k].qty += qty;
      groups[k].discount += disc;
      groups[k].net += net;
    };

    filtered.forEach(r => {
      if (groupBy === 'day') {
        const iso = UI.toISODate(r._date);
        addG(iso, UI.formatDateOnly(r._date), 1, r._qty, r._type === 'sale' ? r._disc : 0, r._signedAmt, iso);
      } else if (groupBy === 'month') {
        const k = `${r._date.getFullYear()}-${String(r._date.getMonth() + 1).padStart(2, '0')}`;
        addG(k, r._date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }), 1, r._qty, r._type === 'sale' ? r._disc : 0, r._signedAmt, k);
      } else if (groupBy === 'payment') {
        addG(r.paymentType, UI.payName(r.paymentType), 1, r._qty, r._type === 'sale' ? r._disc : 0, r._signedAmt);
      } else if (groupBy === 'publisher') {
        r._items.forEach(i => {
          const pk = i.publisher === 'nübihar' ? 'nübihar' : i.publisher === 'zehra' ? 'zehra' : 'other';
          const pct = i.discountPct !== undefined ? i.discountPct : (r.discountPct || 0);
          const sub = i.price * i.quantity;
          addG(pk, UI.pubName(pk), 1, i.quantity * r._sign, r._type === 'sale' ? sub * pct / 100 : 0, sub * (1 - pct / 100) * r._sign);
        });
      } else if (groupBy === 'book') {
        r._items.forEach(i => {
          const pct = i.discountPct !== undefined ? i.discountPct : (r.discountPct || 0);
          const sub = i.price * i.quantity;
          addG(i.productId || i.name, i.name, 1, i.quantity * r._sign, r._type === 'sale' ? sub * pct / 100 : 0, sub * (1 - pct / 100) * r._sign);
        });
      }
    });

    const groupedArr = Object.values(groups).sort((a, b) =>
      (groupBy === 'day' || groupBy === 'month') ? b.sortKey.localeCompare(a.sortKey) : b.net - a.net
    );
    App.Reports._lastGrouped = groupedArr;
    App.Reports._lastFiltered = filtered;
    App.Reports._lastMeta = { ...meta, rangeLabel, netSales, grossSales, totalReturns, netBooks, totalDisc };

    document.getElementById('rpt-grouped-tbody').innerHTML = groupedArr.length ? groupedArr.map(g => `
      <tr>
        <td style="font-weight:600;">${UI.escapeHtml(g.label)}</td>
        <td>${g.count}</td>
        <td>${g.qty}</td>
        <td style="color:var(--yellow);">${g.discount > 0 ? UI.formatCurrency(g.discount) : '—'}</td>
        <td style="text-align:right; font-weight:700; color:${g.net < 0 ? 'var(--red)' : 'var(--green)'};">${UI.formatCurrency(g.net)}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">Bu tarih aralığında kayıt yok.</td></tr>';

    // Publisher Chart
    const pubTotals = { nübihar: 0, zehra: 0, other: 0 };
    filtered.forEach(r => r._items.forEach(i => {
      const pk = i.publisher === 'nübihar' ? 'nübihar' : i.publisher === 'zehra' ? 'zehra' : 'other';
      const pct = i.discountPct !== undefined ? i.discountPct : (r.discountPct || 0);
      pubTotals[pk] += i.price * i.quantity * (1 - pct / 100) * r._sign;
    }));
    const maxPub = Math.max(...Object.values(pubTotals).map(Math.abs), 1);
    document.getElementById('publisher-chart').innerHTML = [
      { label: 'Nübihar', val: pubTotals.nübihar, color: '#38bdf8' },
      { label: 'Zehra', val: pubTotals.zehra, color: '#14b8a6' },
      { label: 'Diğer', val: pubTotals.other, color: '#94a3b8' }
    ].map(r => `
      <div class="bar-row">
        <span class="bar-label">${r.label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(Math.max(0, r.val) / maxPub * 100).toFixed(1)}%; background:${r.color};"></div></div>
        <span class="bar-val">${UI.formatCurrency(r.val)}</span>
      </div>
    `).join('');

    // Payment Chart
    const payTotals = { cash: 0, card: 0, transfer: 0 };
    filtered.forEach(r => { payTotals[r.paymentType] = (payTotals[r.paymentType] || 0) + r._signedAmt; });
    const maxPay = Math.max(...Object.values(payTotals).map(Math.abs), 1);
    document.getElementById('payment-chart').innerHTML = [
      { label: 'Nakit', val: payTotals.cash, color: '#10b981' },
      { label: 'Kart', val: payTotals.card, color: '#38bdf8' },
      { label: 'Havale', val: payTotals.transfer, color: '#0ea5e9' }
    ].map(r => `
      <div class="bar-row">
        <span class="bar-label">${r.label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(Math.max(0, r.val) / maxPay * 100).toFixed(1)}%; background:${r.color};"></div></div>
        <span class="bar-val">${UI.formatCurrency(r.val)}</span>
      </div>
    `).join('');

    // Top 10 Books
    const bMap = {};
    filtered.forEach(r => r._items.forEach(i => {
      const k = i.productId || i.name;
      const pct = i.discountPct !== undefined ? i.discountPct : (r.discountPct || 0);
      if (!bMap[k]) bMap[k] = { name: i.name, publisher: i.publisher, qty: 0, rev: 0 };
      bMap[k].qty += i.quantity * r._sign;
      bMap[k].rev += i.price * i.quantity * (1 - pct / 100) * r._sign;
    }));
    const topBooks = Object.values(bMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
    document.getElementById('top-books-tbody').innerHTML = topBooks.length ? topBooks.map((b, i) => `
      <tr>
        <td style="font-weight:700;">${i + 1}</td>
        <td>${UI.escapeHtml(b.name)}</td>
        <td>${UI.pubBadge(b.publisher)}</td>
        <td>${b.qty}</td>
        <td style="text-align:right; font-weight:700; color:var(--green);">${UI.formatCurrency(b.rev)}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center; padding:18px; color:var(--text-muted);">Veri yok</td></tr>';

    // Detailed receipts
    document.getElementById('rpt-details-tbody').innerHTML = filtered.length ? filtered.slice(0, 200).map(r => `
      <tr>
        <td style="font-family:monospace; font-weight:600;">${UI.escapeHtml(r.receiptNo)}</td>
        <td>${r._type === 'return' ? '<span class="badge badge-return">İade</span>' : '<span class="badge badge-sale">Satış</span>'}</td>
        <td>${UI.formatDateOnly(r._date)}</td>
        <td>${UI.formatTimeOnly(r._date)}</td>
        <td>${UI.payName(r.paymentType)}</td>
        <td style="text-align:right; font-weight:700; color:${r._type === 'return' ? 'var(--red)' : 'var(--green)'};">${UI.formatCurrency(r._signedAmt)}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">Kayıt yok</td></tr>';
  },

  saveTemplate() {
    const name = prompt('Rapor şablonu adı (örn: Aylık Nübihar Satışları):');
    if (!name || !name.trim()) return;
    const list = LocalDB.read(LOCAL_KEYS.rptTemplates, []);
    list.push({
      id: 'tpl_' + Date.now(),
      name: name.trim(),
      from: document.getElementById('rpt-date-from').value,
      to: document.getElementById('rpt-date-to').value,
      pub: document.getElementById('rpt-filter-pub').value,
      pay: document.getElementById('rpt-filter-pay').value,
      type: document.getElementById('rpt-filter-type').value,
      groupBy: document.getElementById('rpt-group-by').value,
      widgets: App.Reports.getWidgets()
    });
    LocalDB.write(LOCAL_KEYS.rptTemplates, list);
    App.Reports.renderTemplates();
    Toast.success(`"${name.trim()}" şablonu kaydedildi.`);
  },

  loadTemplate(id) {
    const tpl = LocalDB.read(LOCAL_KEYS.rptTemplates, []).find(t => t.id === id);
    if (!tpl) return;
    document.getElementById('rpt-date-from').value = tpl.from || '';
    document.getElementById('rpt-date-to').value = tpl.to || '';
    document.getElementById('rpt-filter-pub').value = tpl.pub || 'all';
    document.getElementById('rpt-filter-pay').value = tpl.pay || 'all';
    document.getElementById('rpt-filter-type').value = tpl.type || 'all';
    document.getElementById('rpt-group-by').value = tpl.groupBy || 'day';
    if (tpl.widgets) LocalDB.write(LOCAL_KEYS.rptWidgets, tpl.widgets);
    App.Reports.compute();
    Toast.info(`"${tpl.name}" uygulandı.`);
  },

  deleteTemplate(id) {
    LocalDB.write(LOCAL_KEYS.rptTemplates, LocalDB.read(LOCAL_KEYS.rptTemplates, []).filter(t => t.id !== id));
    App.Reports.renderTemplates();
  },

  renderTemplates() {
    const el = document.getElementById('rpt-templates-list');
    if (!el) return;
    const list = LocalDB.read(LOCAL_KEYS.rptTemplates, []);
    el.innerHTML = list.map(t => `
      <span class="badge badge-other" style="gap:6px; padding:4px 8px;">
        <button type="button" style="font-weight:600;" onclick="App.Reports.loadTemplate('${UI.escapeHtml(t.id)}')">${UI.escapeHtml(t.name)}</button>
        <button type="button" style="color:var(--red);" onclick="App.Reports.deleteTemplate('${UI.escapeHtml(t.id)}')">✕</button>
      </span>
    `).join('');
  },

  exportExcel() {
    if (!App.Reports._lastGrouped.length) { Toast.warning('İndirilecek rapor verisi yok.'); return; }
    const col = App.Reports._lastMeta.col || 'Grup';
    const rows = App.Reports._lastGrouped.map(g => ({
      [col]: g.label,
      'İşlem Sayısı': g.count,
      'Net Adet': g.qty,
      'İndirim (TL)': Number(g.discount.toFixed(2)),
      'Net Tutar (TL)': Number(g.net.toFixed(2))
    }));
    App.Excel.downloadSheet(rows, 'Rapor', `rapor_${UI.toISODate(new Date())}.xlsx`);
    Toast.success('Rapor Excel olarak indirildi.');
  },

  printReport() {
    const m = App.Reports._lastMeta;
    const rows = App.Reports._lastGrouped || [];
    const html = `
      <div style="font-family:Inter,Arial,sans-serif; max-width:760px; margin:0 auto; color:#111;">
        <h2 style="margin-bottom:4px;">${UI.escapeHtml(State.settings.businessName || 'Nübihar & Zehra Yayınları')} — ${UI.escapeHtml(m.title || 'Rapor')}</h2>
        <div style="font-size:12px; color:#555; margin-bottom:14px;">Tarih Aralığı: ${UI.escapeHtml(m.rangeLabel || 'Tümü')} · Yazdırma: ${UI.formatDateTime(new Date())}</div>
        <div style="display:flex; gap:18px; border:1px solid #cbd5e1; padding:10px 14px; border-radius:6px; margin-bottom:16px;">
          <div><div style="font-size:11px;color:#64748b;">NET SATIŞ</div><strong>${UI.formatCurrency(m.netSales)}</strong></div>
          <div><div style="font-size:11px;color:#64748b;">BRÜT SATIŞ</div><strong>${UI.formatCurrency(m.grossSales)}</strong></div>
          <div><div style="font-size:11px;color:#64748b;">İADE</div><strong>${UI.formatCurrency(m.totalReturns)}</strong></div>
          <div><div style="font-size:11px;color:#64748b;">NET ADET</div><strong>${m.netBooks}</strong></div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead><tr style="border-bottom:2px solid #111; text-align:left;">
            <th style="padding:6px;">${UI.escapeHtml(m.col || 'Grup')}</th>
            <th style="padding:6px;">İşlem</th>
            <th style="padding:6px;">Net Adet</th>
            <th style="padding:6px;">İndirim</th>
            <th style="padding:6px; text-align:right;">Net Tutar</th>
          </tr></thead>
          <tbody>
            ${rows.map(g => `<tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:6px;">${UI.escapeHtml(g.label)}</td>
              <td style="padding:6px;">${g.count}</td>
              <td style="padding:6px;">${g.qty}</td>
              <td style="padding:6px;">${UI.formatCurrency(g.discount)}</td>
              <td style="padding:6px; text-align:right; font-weight:600;">${UI.formatCurrency(g.net)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    const f = document.getElementById('print-frame');
    f.style.display = 'block';
    f.innerHTML = html;
    window.print();
    setTimeout(() => { f.style.display = 'none'; f.innerHTML = ''; }, 400);
  }
};

// ================================================================
// BUSINESS SETTINGS
// ================================================================
App.Settings = {
  async load() {
    let s = LocalDB.read(LOCAL_KEYS.settings, State.settings);
    if (State.cloudReady && db) {
      try {
        const doc = await db.collection('settings').doc('business').get();
        if (doc.exists) s = { ...s, ...doc.data() };
      } catch (_) {}
    }
    State.settings = { ...State.settings, ...s };
    document.getElementById('setting-business-name').value = State.settings.businessName || '';
    document.getElementById('setting-address').value = State.settings.address || '';
    document.getElementById('setting-phone').value = State.settings.phone || '';
    document.getElementById('setting-thanks').value = State.settings.thanks || '';
  },

  async save() {
    const data = {
      businessName: document.getElementById('setting-business-name').value.trim() || 'Nübihar & Zehra Yayınları',
      address: document.getElementById('setting-address').value.trim(),
      phone: document.getElementById('setting-phone').value.trim(),
      thanks: document.getElementById('setting-thanks').value.trim() || 'Alışverişiniz için teşekkürler!'
    };
    State.settings = data;
    LocalDB.write(LOCAL_KEYS.settings, data);
    if (State.cloudReady && db) {
      try {
        await db.collection('settings').doc('business').set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) { Toast.error('Buluta kaydedilemedi: ' + e.message); return; }
    }
    Toast.success('İşletme bilgileri kaydedildi.');
  }
};

// ================================================================
// EVENTS & BOOTSTRAP (ZERO LOGIN — INSTANT START!)
// ================================================================
function bindEvents() {
  // Navigation
  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', () => UI.navigateTo(el.dataset.section));
  });
  document.getElementById('cloud-status-chip')?.addEventListener('click', () => UI.navigateTo('settings'));

  // Theme & Voice
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => Theme.toggle());
  document.getElementById('voice-toggle-btn')?.addEventListener('click', () => {
    State.voiceEnabled = !State.voiceEnabled;
    localStorage.setItem('nzpos_voice', String(State.voiceEnabled));
    Sound.updateToggleUI();
  });

  // Modals close
  document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', () => b.dataset.close === 'camera-modal' ? Barcode.closeCamera() : UI.closeModal(b.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', (e) => {
      if (e.target === o) o.id === 'camera-modal' ? Barcode.closeCamera() : UI.closeModal(o.id);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Barcode.closeCamera();
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });

  // POS Controls
  document.getElementById('btn-clear-receipt')?.addEventListener('click', () => { if (!State.cart.length || confirm('Aktif fiş temizlensin mi?')) Cart.clear(false); });
  document.getElementById('pay-btn')?.addEventListener('click', () => App.POS.saveActiveReceipt(false));
  document.getElementById('btn-cash-modal')?.addEventListener('click', () => App.POS.openCashModal());
  document.getElementById('btn-print-last')?.addEventListener('click', () => {
    const r = State.currentReceipt || State.receipts[0];
    if (r) App.ReceiptView.view(r); else Toast.info('Henüz yazdırılacak fiş yok.');
  });
  document.getElementById('camera-btn')?.addEventListener('click', () => Barcode.openCamera());
  document.getElementById('pos-quick-add-book-btn')?.addEventListener('click', () => App.Products.openAdd('', true));
  document.getElementById('cancel-edit-receipt-btn')?.addEventListener('click', () => Cart.clear(false));

  document.getElementById('mode-sale')?.addEventListener('change', () => App.POS.setMode('sale'));
  document.getElementById('mode-return')?.addEventListener('change', () => App.POS.setMode('return'));

  document.getElementById('discount-pct')?.addEventListener('input', (e) => Cart.setDiscountPct(e.target.value));
  document.querySelectorAll('#discount-presets .disc-chip').forEach(b => b.addEventListener('click', () => Cart.setDiscountPct(b.dataset.pct)));
  document.querySelectorAll('#pos-pay-tabs .pay-tab').forEach(b => b.addEventListener('click', () => App.POS.setPaymentType(b.dataset.type)));

  document.getElementById('product-search')?.addEventListener('input', () => App.POS.renderTiles());
  document.querySelectorAll('.pub-chip-btn').forEach(b => b.addEventListener('click', () => {
    State.currentPubFilter = b.dataset.pub;
    App.POS.renderTiles();
  }));

  // Payment Modal
  document.querySelectorAll('[data-modal-pay]').forEach(b => b.addEventListener('click', () => App.POS.selectModalPay(b.dataset.modalPay)));
  document.getElementById('cash-received')?.addEventListener('input', () => App.POS.calcChange());
  document.getElementById('cash-received')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); App.POS.saveActiveReceipt(true); } });
  document.getElementById('complete-payment-btn')?.addEventListener('click', () => App.POS.saveActiveReceipt(true));

  // Unknown Barcode
  document.getElementById('add-unknown-product-btn')?.addEventListener('click', () => App.Products.openAdd(State.lastBarcode || '', true));

  // Receipts Section
  document.getElementById('receipts-new-btn')?.addEventListener('click', () => { Cart.clear(false); UI.navigateTo('pos'); });
  document.getElementById('export-receipts-btn')?.addEventListener('click', () => App.Receipts.exportExcel());
  ['filter-date-from', 'filter-date-to', 'filter-receipt-type'].forEach(id => document.getElementById(id)?.addEventListener('change', () => App.Receipts.render()));
  document.getElementById('receipt-search')?.addEventListener('input', () => App.Receipts.render());
  document.getElementById('filter-receipts-clear-btn')?.addEventListener('click', () => {
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    document.getElementById('filter-receipt-type').value = 'all';
    document.getElementById('receipt-search').value = '';
    App.Receipts.render();
  });
  document.getElementById('confirm-return-btn')?.addEventListener('click', () => App.Receipts.confirmReturn());

  // Products & Excel
  document.getElementById('add-product-btn')?.addEventListener('click', () => App.Products.openAdd('', false));
  document.getElementById('save-product-btn')?.addEventListener('click', () => App.Products.save());
  document.getElementById('product-cam-btn')?.addEventListener('click', () => Barcode.openCamera('p-barcode'));
  document.getElementById('products-search')?.addEventListener('input', () => App.Products.render());
  document.getElementById('products-publisher-filter')?.addEventListener('change', () => App.Products.render());
  document.getElementById('products-avail-filter')?.addEventListener('change', () => App.Products.render());
  document.getElementById('bulk-price-btn')?.addEventListener('click', () => { document.getElementById('bp-percent').value = ''; UI.openModal('bulk-price-modal'); });
  document.getElementById('apply-bulk-price-btn')?.addEventListener('click', () => App.Products.applyBulkPrice());
  document.getElementById('open-excel-import-btn')?.addEventListener('click', () => App.Excel.openModal());
  document.getElementById('excel-modal-template-btn')?.addEventListener('click', () => App.Excel.downloadTemplate());
  document.getElementById('export-products-excel-btn')?.addEventListener('click', () => App.Excel.exportProducts());

  const dz = document.getElementById('excel-dropzone');
  const fi = document.getElementById('excel-file-input');
  dz?.addEventListener('click', () => fi.click());
  dz?.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--primary)'; });
  dz?.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
  dz?.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.style.borderColor = '';
    const f = e.dataTransfer?.files?.[0];
    if (f) App.Excel.parseFile(f);
  });
  fi?.addEventListener('change', (e) => { if (e.target.files?.[0]) App.Excel.parseFile(e.target.files[0]); });
  document.getElementById('confirm-excel-import-btn')?.addEventListener('click', () => App.Excel.confirmImport());

  // Reports
  document.getElementById('toggle-rpt-customizer-btn')?.addEventListener('click', () => {
    document.getElementById('rpt-customizer')?.classList.toggle('show');
  });
  document.querySelectorAll('.rpt-quick-period').forEach(b => b.addEventListener('click', () => App.Reports.setQuickPeriod(b.dataset.period)));
  ['rpt-date-from', 'rpt-date-to', 'rpt-filter-pub', 'rpt-filter-pay', 'rpt-filter-type', 'rpt-group-by'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => App.Reports.compute());
  });
  document.querySelectorAll('#rpt-widget-toggles input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const m = App.Reports.getWidgets();
      m[cb.dataset.widget] = cb.checked;
      LocalDB.write(LOCAL_KEYS.rptWidgets, m);
      App.Reports.applyWidgets();
    });
  });
  document.getElementById('rpt-save-template-btn')?.addEventListener('click', () => App.Reports.saveTemplate());
  document.getElementById('rpt-export-excel-btn')?.addEventListener('click', () => App.Reports.exportExcel());
  document.getElementById('rpt-print-btn')?.addEventListener('click', () => App.Reports.printReport());

  // Settings & Cloud Backup
  document.getElementById('save-settings-btn')?.addEventListener('click', () => App.Settings.save());
  document.getElementById('cloud-backup-now-btn')?.addEventListener('click', () => App.Cloud.createBackupSnapshot('manual', false));
  document.getElementById('cloud-sync-local-btn')?.addEventListener('click', () => App.Cloud.syncLocalToCloud());
  const snapChk = document.getElementById('auto-cloud-snapshot-chk');
  if (snapChk) {
    snapChk.checked = State.autoCloudSnapshot;
    snapChk.addEventListener('change', (e) => {
      State.autoCloudSnapshot = e.target.checked;
      localStorage.setItem('nzpos_auto_cloud_snap', String(State.autoCloudSnapshot));
    });
  }

  // Android Mobile Camera & Price Mode Events
  App.Mobile.bindEvents();
}

// ================================================================
// ANDROID MOBILE INSTANT CAMERA + PRICE & DISCOUNT MODE
// ================================================================
App.Mobile = {
  _scanner: null,
  _running: false,
  _opening: false,
  _cancelOpen: false,
  _lastScanCode: '',
  _lastScanTime: 0,
  _activeProduct: null,
  _activeDiscountPct: 0,
  _deferredPrompt: null,

  isActive() {
    return window.innerWidth <= 720 || document.body.classList.contains('mobile-mode');
  },

  togglePreviewMode() {
    const on = document.body.classList.toggle('mobile-mode');
    const btn = document.getElementById('mobile-mode-toggle-btn');
    if (btn) {
      btn.classList.toggle('ok', on);
      btn.textContent = on ? 'Bilgisayar Modu' : 'Telefon Modu';
    }
    if (on && State.currentSection === 'pos') {
      App.Mobile.updateCartUI();
      App.Mobile.startCamera();
    } else {
      App.Mobile.stopCamera();
      App.Mobile.updateCartUI();
    }
  },

  async startCamera() {
    if (App.Mobile._running || App.Mobile._opening || typeof Html5Qrcode === 'undefined') return;
    if (document.hidden || State.currentSection !== 'pos' || !App.Mobile.isActive()) return;

    await Barcode.closeCamera();

    const reader = document.getElementById('mob-camera-reader');
    const ph = document.getElementById('mob-cam-placeholder');
    const toggleBtn = document.getElementById('mob-cam-toggle-btn');
    if (!reader) return;

    App.Mobile._opening = true;
    App.Mobile._cancelOpen = false;

    try {
      const formats = typeof Html5QrcodeSupportedFormats !== 'undefined' ? [
        Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.QR_CODE
      ] : undefined;

      const scanner = new Html5Qrcode('mob-camera-reader', formats ? { formatsToSupport: formats } : undefined);
      App.Mobile._scanner = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 250, height: 130 } },
        (decodedText) => App.Mobile.onScan(decodedText),
        () => {}
      );
      App.Mobile._opening = false;
      App.Mobile._running = true;

      // If user left app, switched tab, or stopped camera while it was still starting -> stop immediately!
      if (App.Mobile._cancelOpen || document.hidden || State.currentSection !== 'pos' || !App.Mobile.isActive()) {
        await App.Mobile.stopCamera();
        return;
      }

      ph?.classList.add('hidden');
      if (toggleBtn) toggleBtn.textContent = 'Durdur';
    } catch (_) {
      App.Mobile._opening = false;
      App.Mobile._running = false;
      await App.Mobile.stopCamera();
    }
  },

  async stopCamera() {
    App.Mobile._cancelOpen = true;
    App.Mobile._running = false;

    // Immediately terminate MediaStream tracks so camera hardware shuts down right away
    CameraGuard.killTracks('mob-camera-reader');

    const sc = App.Mobile._scanner;
    App.Mobile._scanner = null;
    if (sc) {
      try { await sc.stop(); } catch (_) {}
      try { sc.clear(); } catch (_) {}
    }

    CameraGuard.killTracks('mob-camera-reader');
    const r = document.getElementById('mob-camera-reader');
    if (r) r.innerHTML = '';
    document.getElementById('mob-cam-placeholder')?.classList.remove('hidden');
    const toggleBtn = document.getElementById('mob-cam-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = 'Kamera Aç';
  },

  onScan(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return;
    const now = Date.now();
    if (code === App.Mobile._lastScanCode && now - App.Mobile._lastScanTime < 2200) return;
    App.Mobile._lastScanCode = code;
    App.Mobile._lastScanTime = now;

    const found = State.products.find(p => p.barcode && String(p.barcode).trim() === code);
    if (found) {
      App.Mobile.showProductCard(found);
    } else {
      Sound.warning();
      State.lastBarcode = code;
      document.getElementById('unknown-barcode-display').textContent = code;
      UI.openModal('unknown-barcode-modal');
    }
  },

  showProductCard(product) {
    App.Mobile._activeProduct = product;
    App.Mobile._activeDiscountPct = 0;

    Sound.success();
    Sound.speakPrice(product.name, product.price);

    document.getElementById('mob-book-pub').innerHTML = UI.pubBadge(product.publisher);
    document.getElementById('mob-book-title').textContent = product.name;
    const availText = product.available === false ? 'Durum: Yok (satışa açık)' : 'Durum: Var';
    document.getElementById('mob-book-sub').textContent = `${product.author ? product.author + ' · ' : ''}${availText}`;

    App.Mobile.setDiscount(0);
    document.getElementById('mob-price-card')?.classList.add('show');
    document.getElementById('mob-search-results').style.display = 'none';
  },

  setDiscount(val) {
    let pct = parseFloat(val);
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    App.Mobile._activeDiscountPct = pct;

    const inp = document.getElementById('mob-disc-input');
    if (inp && Number(inp.value) !== pct) inp.value = pct;
    document.querySelectorAll('#mob-disc-chips .mob-disc-chip').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.mobPct) === pct);
    });

    const p = App.Mobile._activeProduct;
    if (!p) return;
    const orig = Number(p.price) || 0;
    const net = orig * (1 - pct / 100);
    const oldEl = document.getElementById('mob-price-old');
    const mainEl = document.getElementById('mob-price-main');
    const noteEl = document.getElementById('mob-price-note');

    if (pct > 0) {
      oldEl.textContent = UI.formatCurrency(orig);
      oldEl.classList.add('show');
      mainEl.textContent = UI.formatCurrency(net);
      noteEl.textContent = `%${pct} indirim uygulandı (-${UI.formatCurrency(orig - net)})`;
    } else {
      oldEl.classList.remove('show');
      mainEl.textContent = UI.formatCurrency(orig);
      noteEl.textContent = 'Liste Fiyatı';
    }
  },

  addActiveToCart() {
    const p = App.Mobile._activeProduct;
    if (!p) return;
    const pct = App.Mobile._activeDiscountPct;
    const existing = State.cart.find(i => i.productId === p.id && Cart.getItemPct(i) === pct);
    if (existing) {
      existing.quantity += 1;
    } else {
      State.cart.push({
        productId: p.id,
        name: p.name,
        author: p.author || '',
        publisher: p.publisher || 'other',
        price: Number(p.price) || 0,
        quantity: 1,
        itemDiscountPct: pct > 0 ? pct : null
      });
    }
    Cart.render();
    Toast.success(`"${p.name}" sepete eklendi`);
  },

  async instantSell() {
    const p = App.Mobile._activeProduct;
    if (!p) return;
    if (State.cart.length === 0) {
      App.Mobile.addActiveToCart();
      await App.POS.saveActiveReceipt(false);
      document.getElementById('mob-price-card')?.classList.remove('show');
    } else {
      App.Mobile.addActiveToCart();
      App.Mobile.openCartModal();
    }
  },

  updateCartUI() {
    const bar = document.getElementById('mob-cart-bar');
    if (!bar) return;
    const show = App.Mobile.isActive() && State.currentSection === 'pos' && State.cart.length > 0;
    bar.classList.toggle('show', show);
    if (show) {
      const cnt = State.cart.reduce((s, i) => s + i.quantity, 0);
      document.getElementById('mob-cart-count-text').textContent = `${cnt} kitap`;
      document.getElementById('mob-cart-total-text').textContent = UI.formatCurrency(Cart.getTotal());
    }
    App.Mobile.renderCartModalItems();
  },

  openCartModal() {
    App.Mobile.renderCartModalItems();
    UI.openModal('mobile-cart-modal');
  },

  renderCartModalItems() {
    const list = document.getElementById('mob-cart-items-list');
    const tot = document.getElementById('mob-modal-total');
    if (!list) return;
    if (!State.cart.length) {
      list.innerHTML = '<div style="text-align:center; padding:18px; color:var(--text-muted);">Sepet boş</div>';
      if (tot) tot.textContent = '0,00 ₺';
      return;
    }
    list.innerHTML = State.cart.map(item => {
      const pct = Cart.getItemPct(item);
      const net = item.price * item.quantity * (1 - pct / 100);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px; border:1px solid var(--border); border-radius:9px; background:var(--bg-subtle);">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:600; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${UI.escapeHtml(item.name)}</div>
            <div style="font-size:11.5px; color:var(--text-secondary);">${UI.formatCurrency(item.price)}${pct > 0 ? ` · -%${pct}` : ''}</div>
          </div>
          <div class="qty-inline">
            <button type="button" class="qty-btn" onclick="Cart.updateQty('${UI.escapeHtml(item.productId)}', -1)">−</button>
            <span style="min-width:18px; text-align:center; font-weight:700;">${item.quantity}</span>
            <button type="button" class="qty-btn" onclick="Cart.updateQty('${UI.escapeHtml(item.productId)}', 1)">+</button>
          </div>
          <strong style="min-width:72px; text-align:right; color:var(--primary-text);">${UI.formatCurrency(net)}</strong>
          <button type="button" style="color:var(--red); font-weight:700; padding:2px 5px;" onclick="Cart.remove('${UI.escapeHtml(item.productId)}')">✕</button>
        </div>
      `;
    }).join('');
    if (tot) tot.textContent = UI.formatCurrency(Cart.getTotal());
  },

  searchOrBarcode(val) {
    const q = String(val || '').trim().toLocaleLowerCase('tr-TR');
    const box = document.getElementById('mob-search-results');
    if (!box) return;
    if (!q) { box.style.display = 'none'; return; }
    const hits = State.products.filter(p =>
      (p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.author || '').toLocaleLowerCase('tr-TR').includes(q)
    ).slice(0, 8);
    if (!hits.length) {
      box.innerHTML = '<div style="padding:10px 12px; font-size:12.5px; color:var(--text-muted);">Sonuç yok (Enter ile barkod ekleyebilirsiniz)</div>';
    } else {
      box.innerHTML = hits.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid var(--border); cursor:pointer;" onclick="App.Mobile.showProductCard(State.products.find(x=>x.id==='${UI.escapeHtml(p.id)}')); document.getElementById('mob-barcode-input').value='';">
          <div>
            <div style="font-weight:600; font-size:13.5px;">${UI.escapeHtml(p.name)}</div>
            <div style="font-size:11.5px; color:var(--text-muted);">${UI.pubName(p.publisher)}</div>
          </div>
          <strong style="color:var(--primary-text);">${UI.formatCurrency(p.price)}</strong>
        </div>
      `).join('');
    }
    box.style.display = 'block';
  },

  bindEvents() {
    document.getElementById('mobile-mode-toggle-btn')?.addEventListener('click', () => App.Mobile.togglePreviewMode());
    document.getElementById('mob-cam-start-btn')?.addEventListener('click', () => App.Mobile.startCamera());
    document.getElementById('mob-cam-toggle-btn')?.addEventListener('click', () => {
      if (App.Mobile._running || App.Mobile._opening) App.Mobile.stopCamera();
      else App.Mobile.startCamera();
    });
    document.getElementById('mob-card-close')?.addEventListener('click', () => {
      document.getElementById('mob-price-card')?.classList.remove('show');
    });

    const mobInp = document.getElementById('mob-barcode-input');
    mobInp?.addEventListener('input', (e) => App.Mobile.searchOrBarcode(e.target.value));
    mobInp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = mobInp.value.trim();
        if (code) {
          mobInp.value = '';
          document.getElementById('mob-search-results').style.display = 'none';
          App.Mobile.onScan(code);
        }
      }
    });

    document.getElementById('mob-disc-input')?.addEventListener('input', (e) => App.Mobile.setDiscount(e.target.value));
    document.querySelectorAll('#mob-disc-chips .mob-disc-chip').forEach(b => {
      b.addEventListener('click', () => App.Mobile.setDiscount(b.dataset.mobPct));
    });

    document.getElementById('mob-add-cart-btn')?.addEventListener('click', () => App.Mobile.addActiveToCart());
    document.getElementById('mob-instant-sell-btn')?.addEventListener('click', () => App.Mobile.instantSell());
    document.getElementById('mob-open-cart-btn')?.addEventListener('click', () => App.Mobile.openCartModal());
    document.getElementById('mob-clear-cart-btn')?.addEventListener('click', () => {
      Cart.clear(false);
      UI.closeModal('mobile-cart-modal');
    });
    document.querySelectorAll('[data-mob-pay]').forEach(b => {
      b.addEventListener('click', () => {
        App.POS.setPaymentType(b.dataset.mobPay);
        document.querySelectorAll('[data-mob-pay]').forEach(x => x.classList.toggle('active', x.dataset.mobPay === b.dataset.mobPay));
      });
    });
    document.getElementById('mob-complete-sale-btn')?.addEventListener('click', async () => {
      await App.POS.saveActiveReceipt(false);
      UI.closeModal('mobile-cart-modal');
      document.getElementById('mob-price-card')?.classList.remove('show');
    });

    // Android PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      App.Mobile._deferredPrompt = e;
      const btn = document.getElementById('android-install-btn');
      if (btn) btn.style.display = 'inline-flex';
    });
    document.getElementById('android-install-btn')?.addEventListener('click', async () => {
      if (!App.Mobile._deferredPrompt) return;
      App.Mobile._deferredPrompt.prompt();
      await App.Mobile._deferredPrompt.userChoice;
      App.Mobile._deferredPrompt = null;
      document.getElementById('android-install-btn').style.display = 'none';
    });

    // Register Service Worker & Automatic Live Update Checker
    App.AutoUpdate.init();
  }
};

// ================================================================
// AUTOMATIC APP UPDATE (CHECKS ON STARTUP, RESUME & EVERY 3 MIN)
// ================================================================
App.AutoUpdate = {
  _currentVersion: null,
  _pendingReload: false,
  _swReg: null,

  init() {
    if (!location.protocol.startsWith('http')) return;

    document.getElementById('app-update-btn')?.addEventListener('click', () => {
      App.AutoUpdate.applyNow();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        App.AutoUpdate._swReg = reg;
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              App.AutoUpdate.handleUpdateReady();
            }
          });
        });
      }).catch(() => {});

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (App.AutoUpdate._pendingReload) {
          location.reload();
        }
      });
    }

    // Check version.json on startup, when returning to app, and every 3 minutes
    App.AutoUpdate.checkVersion(true);
    setInterval(() => App.AutoUpdate.checkVersion(false), 180000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        App.AutoUpdate._swReg?.update().catch(() => {});
        App.AutoUpdate.checkVersion(false);
      }
    });
  },

  async checkVersion(isInitial = false) {
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const ver = `${data.version || ''}_${data.updatedAt || ''}`;
      if (isInitial || !App.AutoUpdate._currentVersion) {
        App.AutoUpdate._currentVersion = ver;
        return;
      }
      if (ver !== App.AutoUpdate._currentVersion) {
        App.AutoUpdate._currentVersion = ver;
        App.AutoUpdate.handleUpdateReady();
      }
    } catch (_) {}
  },

  handleUpdateReady() {
    // If no active sale in cart and no modal open, auto-apply smoothly right away!
    if (State.cart.length === 0 && !UI.isModalOpen()) {
      App.AutoUpdate.applyNow();
    } else {
      // Don't interrupt an active sale — show 1-tap button and apply once cart clears
      App.AutoUpdate._pendingReload = true;
      const btn = document.getElementById('app-update-btn');
      if (btn) btn.style.display = 'inline-flex';
      Toast.info('Yeni güncelleme hazır. Satış bitince otomatik uygulanacak.');
    }
  },

  async applyNow() {
    App.AutoUpdate._pendingReload = true;
    Toast.info('Yeni sürüm yükleniyor...');
    CameraGuard.stopAll();
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (App.AutoUpdate._swReg?.waiting) {
        App.AutoUpdate._swReg.waiting.postMessage('SKIP_WAITING');
      }
    } catch (_) {}
    setTimeout(() => location.reload(), 450);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  Theme.apply(Theme.current);
  Sound.updateToggleUI();
  bindEvents();
  Barcode.init();

  // Instant start from local cache — zero waiting, zero login!
  LocalDB.ensureSeed();
  State.products = LocalDB.read(LOCAL_KEYS.products, SEED_PRODUCTS);
  State.receipts = LocalDB.read(LOCAL_KEYS.receipts, []);
  await App.Settings.load();

  // Default report dates to current month
  App.Reports.setQuickPeriod('month');
  App.POS.renderTiles();
  Cart.render();
  UI.updateClockAndFooter();
  setInterval(UI.updateClockAndFooter, 30000);

  // On Android phones, auto-start live camera barcode scanner immediately!
  if (App.Mobile.isActive() && State.currentSection === 'pos') {
    App.Mobile.startCamera();
  }

  // Connect to Firebase Cloud automatically in background
  await App.Cloud.init();
});
