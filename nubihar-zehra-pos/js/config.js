// ============================================================
// Firebase Yapılandırma Dosyası
// ============================================================
// Bu dosyayı Firebase konsolundan aldığınız bilgilerle doldurun.
// Nasıl yapılır: KURULUM.md dosyasını okuyun.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "BURAYA_API_KEY_YAZIN",
  authDomain: "BURAYA_AUTH_DOMAIN_YAZIN",
  projectId: "BURAYA_PROJECT_ID_YAZIN",
  storageBucket: "BURAYA_STORAGE_BUCKET_YAZIN",
  messagingSenderId: "BURAYA_MESSAGING_SENDER_ID_YAZIN",
  appId: "BURAYA_APP_ID_YAZIN"
};

// Firebase yapılandırması tamamlandı mı kontrol et
function isFirebaseConfigured() {
  return !Object.values(FIREBASE_CONFIG).some(v => v.includes('BURAYA'));
}
