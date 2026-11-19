// ============================================================
// Firebase Yapılandırma Dosyası — Nübihar & Zehra Yayınları
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAEMfDx7o9vFY4ymqZB-d3KhfaGOv4NNC0",
  authDomain: "nubihar-zehra-pos.firebaseapp.com",
  projectId: "nubihar-zehra-pos",
  storageBucket: "nubihar-zehra-pos.firebasestorage.app",
  messagingSenderId: "435570940029",
  appId: "1:435570940029:web:f50a391dce46b3ccea7914",
  measurementId: "G-KFDD4F7CBD"
};

// Firebase yapılandırması tamamlandı mı kontrol et
function isFirebaseConfigured() {
  return !Object.values(FIREBASE_CONFIG).some(v => String(v).includes('BURAYA'));
}
