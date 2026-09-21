# udf2md — UYAP UDF → Markdown Dönüştürücü

> UYAP `.udf` dosyalarını yapay zeka araçlarının (ChatGPT, Gemini, Claude vb.) kolayca okuyabileceği **Markdown (.md)** formatına çeviren %100 tarayıcı tabanlı, açık kaynak araç.

## 🔒 Neden Bu Araca İhtiyaç Var?

UYAP Doküman Editörü'nün ürettiği `.udf` dosyaları, aslında sıkıştırılmış bir ZIP arşivi içinde özel bir XML yapısıdır. Ne ChatGPT, ne Gemini ne de başka bir LLM bu dosya tipini doğrudan okuyabilir.

Bu araç, `.udf` dosyasını tarayıcınızın belleğinde açar, XML yapısını analiz eder ve yapay zekanın anlayacağı temiz bir Markdown belgesine dönüştürür.

**Hiçbir veri hiçbir sunucuya gönderilmez.** Tüm işlemler `JSZip` ve `DOMParser` kullanılarak doğrudan tarayıcınızda yapılır. İnternet bağlantınızı kapatıp da kullanabilirsiniz.

## 🚀 Kullanım

1. `index.html` dosyasını tarayıcınızda açın.
2. `.udf` dosyanızı sürükleyip bırakın veya "Dosya Seç" düğmesine tıklayın.
3. Markdown çıktısını **kopyalayın** veya `.md` olarak **indirin**.
4. ChatGPT, Gemini veya Claude'a yapıştırın.

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
