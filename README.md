# udf2md — UYAP UDF → Markdown & LLM / RAG Doküman Yükleyici ⚖️🤖

[![CI](https://github.com/eimza-kep/udf2md/actions/workflows/ci.yml/badge.svg)](https://github.com/eimza-kep/udf2md/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependency](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Python: 3.8+](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://python.org)
[![LangChain & LlamaIndex](https://img.shields.io/badge/AI-LangChain%20%7C%20LlamaIndex-orange.svg)](udf_loader.py)
[![Blog](https://img.shields.io/badge/Rehber-UYAP%20Teknik%20Destek-red.svg)](https://uyapteknikdestek.site/)

> UYAP `.udf` dava dosyalarını, dilekçeleri ve gerekçeli mahkeme kararlarını yapay zeka modellerinin (ChatGPT, Claude, Gemini) ve **RAG (Retrieval-Augmented Generation)** vektör veri tabanlarının (Chroma, FAISS, Pinecone) anlayabileceği **Markdown (.md)** ve **JSON** formatına dönüştüren; **LangChain `UDFLoader`** ve **LlamaIndex `UDFReader`** destekli açık kaynak LegalTech aracıdır.

---

## ✨ Öne Çıkan Özellikler (v1.4)

* 🦜 **LangChain & LlamaIndex Uyumlu (Python):** `UDFLoader` ve `UDFReader` ile tekil dosya veya tüm klasörleri doğrudan `Document` nesnesi olarak yükleme.
* 🏛️ **Otomatik Hukuki Metadata Çıkarımı:** Mahkeme adı, Esas No, Karar No, Belge Türü (Dava Dilekçesi, Gerekçeli Karar, Tensip Zaptı vb.) otomatik ayıklanır.
* ✍️ **E-İmza (XML-DSIG) Tespiti:** Belge içindeki elektronik imza sahipleri, imza tarihi, makam/unvan ve sertifika sağlayıcıları (TÜRKTRUST, E-Tuğra, TÜBİTAK vb.) metadata olarak yakalanır.
* 📑 **Zengin Biçimlendirme & Tablo Desteği:** Paragraf hizalamaları, kalın/italik stiller ve UYAP tabloları standart GitHub Markdown formatına eksiksiz çevrilir.
* ⚡ **Sıfır Dış Bağımlılık (Zero-Dependency):** Hem JavaScript/Node.js hem de Python çekirdeği harici ağır paketlere ihtiyaç duymadan saf standart kütüphane mimarisiyle çalışır.
* 📁 **Toplu Klasör İşleme:** `--recursive` parametresi ile binlerce UDF dosyasını tek komutla dönüştürebilme.
* 🌐 **%100 İstemci Taraflı Web Arayüzü:** `index.html` üzerinden hiçbir veri sunucuya gitmeden tarayıcıda doğrudan dönüştürme.

---

## 🛠️ Kurulum ve Yerel Geliştirme (Local Setup)

### Sistem Gereksinimleri
- **Node.js:** v18.0 veya üzeri (CLI ve Web arayüzü için)
- **Python:** v3.8 veya üzeri (LangChain / LlamaIndex doküman yükleyicisi için)
- `git`

### 1. Depoyu Klonlama
```bash
git clone https://github.com/eimza-kep/udf2md.git
cd udf2md
```

### 2. Node.js Ortamı
Projede harici npm paketi bulunmamaktadır (`zero-dependency`). Doğrudan çalıştırılabilir:
```bash
# Yardım mesajını görüntüleme
node cli.js --help

# Node.js birim testlerini çalıştırma
node test/test.js
```

### 3. Python Sanal Ortamı (LangChain / LlamaIndex Kullanımı İçin)
```bash
# Sanal ortam oluşturma ve aktifleştirme (İsteğe bağlı)
python -m venv venv
# Linux/macOS:
source venv/bin/activate
# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# Python Doküman Yükleyici birim testlerini çalıştırma
python test_udf_loader.py
```

---

## 🚀 CLI Kullanım Rehberi (Node.js)

### 1. Tekil Dosya Dönüştürme
```bash
# Terminale Markdown çıktısı basar
node cli.js dilekce.udf

# Dosyaya kaydeder
node cli.js dilekce.udf cikti.md

# YAML Frontmatter (Başlık, Mahkeme, Esas No, E-İmza) başlığıyla kaydeder
node cli.js karar.udf karar.md --with-frontmatter
```

### 2. LLM ve RAG İçin JSON / Metadata Çıktısı
```bash
# Tüm belge içeriğini ve hukuki metadataları JSON olarak verir
node cli.js gerekceli_karar.udf --json

# Sadece metaverileri (Kelime sayısı, mahkeme, imza sahipleri) görüntüler
node cli.js gerekceli_karar.udf --metadata
```

### 3. Toplu Klasör Dönüştürme
```bash
# Klasördeki tüm .udf dosyalarını Markdown'a çevirip md_ciktilar klasörüne kaydeder
node cli.js ./arsiv/ --output-dir ./md_ciktilar/ --recursive
```

---

## 🦜 Python & LangChain RAG Entegrasyonu

LangChain projelerinizde UYAP dosyalarını doğrudan vektörleştirip LLM'e besleyebilirsiniz:

```python
from udf_loader import UDFLoader
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

# 1. UDF dosyasını veya klasörünü yükleyin
loader = UDFLoader("emsal_kararlar/", recursive=True, to_markdown=True)
documents = loader.load()

# Metadata zenginliğini kontrol edin
for doc in documents:
    print(f"📄 Dosya: {doc.metadata['file_name']}")
    print(f"🏛️ Mahkeme: {doc.metadata['court']}")
    print(f"⚖️ Esas/Karar: {doc.metadata['case_number']} / {doc.metadata['decision_number']}")
    print(f"✍️ İmza Sayısı: {doc.metadata['signer_count']}")

# 2. Vektör veri tabanına indeksleyin
# embeddings = OpenAIEmbeddings()
# vectorstore = FAISS.from_documents(documents, embeddings)
# retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
```

---

## 🦙 LlamaIndex Entegrasyonu

```python
from pathlib import Path
from udf_loader import UDFReader

reader = UDFReader(to_markdown=True)
documents = reader.load_data(Path("dava_dosyasi.udf"))

print(documents[0].text[:200])
print(documents[0].metadata)
```

---

## 📊 Hukuki Metadata Şeması

| Alan (Key) | Tip | Açıklama | Örnek Değer |
|:---|:---|:---|:---|
| `court` | `string` | İlgili Mahkeme, Savcılık veya Merci Adı | `ANKARA 2. ASLİYE TİCARET MAHKEMESİNE` |
| `case_number` | `string` | Dava Esas Numarası | `2026/1042` |
| `decision_number` | `string` | Mahkeme Karar Numarası | `2026/512` |
| `document_type` | `string` | Tespit Edilen Belge Türü | `Gerekçeli Karar`, `Dava Dilekçesi`, `Tensip Zaptı` |
| `signers` | `list[dict]` | E-İmza Sahipleri, Rolleri ve Zaman Damgası | `[{"name": "Av. Ahmet Yılmaz", "role": "Vekil"}]` |
| `signer_count` | `int` | Belgede Tespit Edilen İmza Sayısı | `2` |
| `has_signatures` | `bool` | Belgenin E-İmzalı Olup Olmadığı | `true` |
| `word_count` | `int` | Toplam Kelime Sayısı | `1450` |
| `file_name` | `string` | Dosya Adı | `karar.udf` |

---

## 🌐 Web Tarayıcısı Üzerinden Kullanım (Java Gerektirmez)

1. Proje ana dizinindeki `index.html` dosyasını Google Chrome, Firefox, Safari veya Edge ile açın.
2. `.udf` dosyanızı tarayıcı penceresine sürükleyip bırakın.
3. Çevrilen Markdown metnini kopyalayıp doğrudan **ChatGPT, Claude, Gemini veya NotebookLM**'e yapıştırın.

---

## 🔗 E-Dönüşüm & Hukuk Teknolojileri Ekosistemi

Bu araç [eimza-kep](https://github.com/eimza-kep) organizasyonunun açık kaynak LegalTech ekosisteminin bir parçasıdır:

* 🇹🇷 **[awesome-turkiye-e-donusum](https://github.com/eimza-kep/awesome-turkiye-e-donusum):** Türkiye E-Dönüşüm ve LegalTech kütüphaneleri listesi.
* 🛠️ **[uyap-editor-hizli-onarim](https://github.com/eimza-kep/uyap-editor-hizli-onarim):** UYAP Doküman Editörü açılmama ve Java bellek aşımı onarım aracı.
* 🖥️ **[uyap-web-udf-editor](https://github.com/eimza-kep/uyap-web-udf-editor):** Tarayıcıda Java gerektirmeden çalışan modern web UDF editörü.
* 📬 **[kep-adresi-dogrulayici](https://github.com/eimza-kep/kep-adresi-dogrulayici):** BTK KEP ve UETS adres doğrulama aracı.
* 📄 **[python-pdf-eimza-dogrulayici](https://github.com/eimza-kep/python-pdf-eimza-dogrulayici):** PAdES e-imza doğrulama kütüphanesi.
* ⚖️ **[avukat-muvekkil-on-kayit-scripti](https://github.com/eimza-kep/avukat-muvekkil-on-kayit-scripti):** Avukatlar için müvekkil ön görüşme ve çıkar çatışması portalı.

---

## 📚 İlgili Teknik Rehberler
* 📄 [UYAP Editör Açılmıyor Hatası ve Java Bellek Sorunları Kesin Çözüm](https://uyapteknikdestek.site/yazilar/uyap-editor-acilmiyor-hatasi-kesin-cozum.html)
* 📄 [UDF Dosyası Nedir ve Telefondan/Mac'ten Nasıl Açılır?](https://uyapteknikdestek.site/yazilar/udf-dosyasi-nedir-telefondan-nasil-acilir.html)
* 📄 [DYS ve UYAP Uyuşmazlıkları: Doküman İmzalama Hataları Çözümü](https://uyapteknikdestek.site/yazilar/dys-dokuman-yonetim-sistemi-eimza-entegrasyonu.html)

---

## 📄 Lisans

MIT License — Açık kaynak ve ücretsizdir.
