# 📱 Android Telefonlara Kurulum Rehberi

Uygulamanız **Android telefonlarda** açıldığında otomatik olarak **Sade Kamera + Anlık Fiyat & İndirim Modu** ile başlar; **bilgisayarda** açıldığında ise geniş masaüstü satış ekranı açılır.

Android telefonlara kurmanın **2 kolay yolu** vardır:

---

## 1. En Hızlı Yol: Tek Tıkla Android Uygulaması Olarak Kur (PWA)

Bilgisayarınıza hiçbir geliştirici aracı kurmadan, 2 dakikada Android telefonlara tam ekran uygulama olarak kurabilirsiniz:

1. `KURULUM.md` dosyasındaki gibi Firebase projenizi bağlayıp ücretsiz **Firebase Hosting**'e yayınlayın (`https://proje-adiniz.web.app`).
2. Android telefonunuzda **Chrome** ile o linki açın.
3. Üstteki **"Uygulamayı Kur"** butonuna (veya Chrome menü `⋮` → **"Uygulamayı yükle / Ana ekrana ekle"**) dokunun.
4. Telefonun ana ekranında **Nübihar Satış** ikonu oluşur — açıldığında tarayıcı çubuğu olmadan tam ekran gerçek bir Android uygulaması gibi çalışır ve kamera doğrudan barkod taramaya hazır başlar!

---

## 2. Doğrudan `.apk` Dosyası Üretmek (Android Studio Kurmadan!)

Bilgisayarınızda Android Studio / Java kurulu değilse bile ücretsiz GitHub üzerinden otomatik `.apk` üretebilirsiniz:

1. Bu proje klasörünü ücretsiz bir [GitHub](https://github.com) deposuna yükleyin (`.github/workflows/build-android-apk.yml` dosyası hazırdır).
2. GitHub'da **Actions → Build Android APK** sekmesine tıklayın (otomatik başlar).
3. ~2 dakika sonra sayfanın altında **`NubiharZehra-POS-Android-APK`** dosyasını indirin.
4. İçindeki `.apk` dosyasını Android telefonunuza gönderip kurun!

> **Not:** Bilgisayarınızdan telefon görünümünü hemen test etmek isterseniz, üst menüdeki **"Telefon Modu"** butonuna tıklayarak Android kamera & anlık fiyat ekranını anında görebilirsiniz.
