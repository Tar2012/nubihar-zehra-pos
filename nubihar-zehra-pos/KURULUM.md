# 📖 Nübihar & Zehra Yayınları — Otomatik Bulut Kurulum Kılavuzu

Uygulama **üyelik ve giriş ekranı olmadan** doğrudan açılır.
Verilerinizin telefon, tablet ve bilgisayar arasında senkronize olması ve **otomatik olarak Google Firebase bulutuna yedeklenmesi** için aşağıdaki 3 kısa adımı yapmanız yeterlidir:

---

## 1. Adım: Ücretsiz Firebase Projesi ve Web Anahtarı

1. [Firebase Console](https://console.firebase.google.com/) adresine girip **Proje oluştur (Create a project)** deyin.
2. Proje açılınca **`</>` (Web)** simgesine tıklayıp uygulamayı kaydedin.
3. Ekrandaki `firebaseConfig` bilgilerini kopyalayıp proje klasörünüzdeki `js/config.js` dosyasının içine yapıştırın:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "proje-adiniz.firebaseapp.com",
  projectId: "proje-adiniz",
  storageBucket: "proje-adiniz.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef..."
};
```

---

## 2. Adım: Sessiz Arka Plan Bağlantısı (Anonim Giriş)

Uygulama sizden şifre veya üyelik istemeden arka planda güvenli bağlantı kurar:
1. Sol menüden **Build → Authentication** → **Başlayın (Get started)**.
2. **Sign-in method** listesinde **Anonim (Anonymous)** seçeneğini **Etkinleştir (Enable)** → **Kaydet**.

---

## 3. Adım: Bulut Veritabanı (Firestore) ve Güvenlik Kuralları

1. Sol menüden **Build → Firestore Database** → **Veritabanı oluştur (Create database)** → Avrupa bölgesi (`europe-west3`) → **Üretim modunda başlat**.
2. **Rules (Kurallar)** sekmesine geçin, klasörünüzdeki `firestore.rules` dosyasının içeriğini yapıştırın ve **Yayınla (Publish)** butonuna tıklayın.

> ✅ **Hepsi bu kadar!** Artık `index.html` açıldığında hiçbir giriş ekranı çıkmadan doğrudan **Hızlı Satış** ekranı başlar ve tüm kitaplarınız, satışlarınız, iadeleriniz ve yedek noktalarınız otomatik olarak buluta yüklenir.

---

## 📥 Excel'den Toplu Kitap Yükleme İpucu

- **Kitap Listesi → Excel'den Toplu Yükle** butonuna basın.
- `.xlsx`, `.xls` veya `.csv` dosyanızı sürükleyip bırakın.
- Yalnızca **Kitap Adı** ve **Fiyat** sütunları yeterlidir — **Yazar** zorunlu değildir!
- Dilerseniz **Örnek Excel Şablonu** butonuna basıp hazır şablonu indirerek doldurabilirsiniz.
