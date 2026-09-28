# udf2md — UYAP UDF → Markdown Dönüştürücü ⚖️🤖

[![CI](https://github.com/eimza-kep/udf2md/actions/workflows/ci.yml/badge.svg)](https://github.com/eimza-kep/udf2md/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependency](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Blog](https://img.shields.io/badge/Rehber-UYAP%20Teknik%20Destek-red.svg)](https://uyapteknikdestek.site/)

> UYAP `.udf` dava dosyalarını ve kararlarını yapay zeka araçlarının (ChatGPT, Gemini, Claude, RAG sistemleri) kolayca okuyabileceği ve vektörleştirebileceği **Markdown (.md)** ve **JSON** formatına çeviren %100 tarayıcı ve **CLI** tabanlı açık kaynak araç.

---

## 🚀 Kullanım

### 1. Terminal / CLI Üzerinden (Hızlı & Otomasyon)
```bash
# Doğrudan terminal çıktısı
node cli.js dilekce.udf

# Markdown dosyasına kaydetme
node cli.js dilekce.udf cikti.md

# LLM / RAG sistemleri için JSON çıktısı alma
node cli.js dilekce.udf --json

# Belge meta verilerini (kelime sayısı, boyut vb.) görme
node cli.js dilekce.udf --metadata

# Görselleri klasöre çıkarma
node cli.js karar.udf -o karar.md --extract-images
```

### 2. Web Tarayıcısı Üzerinden
1. `index.html` dosyasını tarayıcınızda açın.
2. `.udf` dosyanızı sürükleyip bırakın veya "Dosya Seç" düğmesine tıklayın.
3. Markdown çıktısını **kopyalayın** veya `.md` olarak **indirin**.
4. ChatGPT, Gemini veya Claude'a doğrudan yapıştırın.

---

## ✨ Özellikler

- **Paragraf ve Metin Biçimlendirme:** Kalın, italik, altı çizili metinler korunur.
- **Tablo Desteği:** UYAP tabloları standart Markdown tablo formatına çevrilir.
- **Akıllı Başlık Algılama:** Büyük fontlu veya kalın ortalanmış satırlar otomatik olarak `#` ve `##` başlıklara dönüştürülür.
- **Görsel Çıkarma:** ZIP içindeki görsel dosyalar (PNG, JPG vb.) tespit edilir ve base64 olarak Markdown'a gömülür veya klasöre çıkarılır.
- **JSON & Meta Veri Desteği:** `--json` ile LLM ve RAG veri yükleme boru hatlarına (ingestion pipelines) doğrudan bağlanabilir.
- **Karakter Kodlama:** UTF-8 ve Windows-1254 (Türkçe) karakter setlerini sorunsuz destekler.

---

## 🔗 E-Dönüşüm & Hukuk Teknolojileri Ekosistemi

Bu araç [eimza-kep](https://github.com/eimza-kep) organizasyonunun açık kaynak LegalTech ve e-dönüşüm ekosisteminin bir parçasıdır:

* 🇹🇷 **[awesome-turkiye-e-donusum](https://github.com/eimza-kep/awesome-turkiye-e-donusum):** Türkiye E-Dönüşüm ve LegalTech kütüphaneleri listesi.
* 🛠️ **[uyap-editor-hizli-onarim](https://github.com/eimza-kep/uyap-editor-hizli-onarim):** UYAP Doküman Editörü açılmama, Java bellek aşımı ve donma onarım aracı.
* 🖥️ **[uyap-web-udf-editor](https://github.com/eimza-kep/uyap-web-udf-editor):** Tarayıcıda Java gerektirmeden çalışan modern web UDF editörü.
* ⚖️ **[avukat-muvekkil-on-kayit-scripti](https://github.com/eimza-kep/avukat-muvekkil-on-kayit-scripti):** Hukuk büroları için müvekkil ön görüşme ve çıkar çatışması (conflict check) portalı.
* 📊 **[avukat-hukuk-excel-hesaplamalari](https://github.com/eimza-kep/avukat-hukuk-excel-hesaplamalari):** Avukatlar için serbest meslek makbuzu, kıdem/ihbar ve vekalet ücreti hesaplama şablonları.

---

## 📚 İlgili Teknik Rehberler
* 📄 [UYAP Editör Açılmıyor Hatası ve Java Bellek Sorunları Kesin Çözüm](https://uyapteknikdestek.site/yazilar/uyap-editor-acilmiyor-hatasi-kesin-cozum.html)
* 📄 [UDF Dosyası Nedir ve Telefondan/Mac'ten Nasıl Açılır?](https://uyapteknikdestek.site/yazilar/udf-dosyasi-nedir-telefondan-nasil-acilir.html)
* 📄 [DYS ve UYAP Uyuşmazlıkları: Doküman İmzalama Hataları Çözümü](https://uyapteknikdestek.site/yazilar/dys-dokuman-yonetim-sistemi-eimza-entegrasyonu.html)

---

## 📄 Lisans

MIT License — Açık kaynak ve ücretsizdir.
