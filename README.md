# udf2md — UYAP UDF → Markdown Dönüştürücü

[![CI](https://github.com/eimza-kep/udf2md/actions/workflows/ci.yml/badge.svg)](https://github.com/eimza-kep/udf2md/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependency](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)

> UYAP `.udf` dosyalarını yapay zeka araçlarının (ChatGPT, Gemini, Claude vb.) kolayca okuyabileceği **Markdown (.md)** formatına çeviren %100 tarayıcı ve **CLI** tabanlı, açık kaynak araç.

## 🚀 Kullanım

### 1. Terminal / CLI Üzerinden (Hızlı & Otomasyon)
```bash
# Doğrudan çalıştırma
node cli.js dilekce.udf

# Dosyaya kaydetme
node cli.js dilekce.udf cikti.md

# Görselleri klasöre çıkarma
node cli.js karar.udf -o karar.md --extract-images
```

### 2. Web Tarayıcısı Üzerinden
1. `index.html` dosyasını tarayıcınızda açın.
2. `.udf` dosyanızı sürükleyip bırakın veya "Dosya Seç" düğmesine tıklayın.
3. Markdown çıktısını **kopyalayın** veya `.md` olarak **indirin**.
4. ChatGPT, Gemini veya Claude'a doğrudan yapıştırın.

## ✨ Özellikler

- **Paragraf ve Metin Biçimlendirme:** Kalın, italik, altı çizili metinler korunur.
- **Tablo Desteği:** UYAP tabloları Markdown tablo formatına çevrilir.
- **Akıllı Başlık Algılama:** Büyük fontlu veya kalın ortalanmış satırlar otomatik olarak `#` ve `##` başlıklara dönüştürülür.
- **Görsel Çıkarma:** ZIP içindeki görsel dosyalar (PNG, JPG vb.) tespit edilir ve base64 olarak Markdown'a gömülür veya ayrı ZIP olarak indirilebilir.
- **Karakter Kodlama:** UTF-8 ve Windows-1254 (Türkçe) karakter setlerini destekler.

## 🛠️ Teknolojiler

| Teknoloji | Amaç |
|-----------|-------|
| Vanilla JavaScript | Framework bağımsızlığı |
| JSZip | UDF (ZIP) arşivini çözme |
| DOMParser | XML → DOM dönüşümü |
| Inter + JetBrains Mono | Modern tipografi |
| Phosphor Icons | Vektörel ikonlar |

## 📄 Lisans

MIT License — Açık kaynak ve ücretsizdir.
