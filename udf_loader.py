#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
udf_loader.py — LangChain & LlamaIndex UYAP UDF Doküman Yükleyici (DocumentLoader) v1.4
=====================================================================================
UYAP (.udf) formatındaki dava dosyalarını, kararları ve dilekçeleri okuyup
LangChain ve LlamaIndex tabanlı LLM / RAG (Retrieval-Augmented Generation) sistemlerine
metadata (Mahkeme, Esas/Karar No, E-İmza) zenginleştirmesiyle aktaran doküman yükleyicisidir.

Özellikler:
- Sıfır Harici Bağımlılık (Pure Python Standart Kütüphane: zipfile + xml.etree)
- LangChain BaseLoader uyumluluğu (UDFLoader)
- LlamaIndex BaseReader uyumluluğu (UDFReader)
- Hukuki Metadata Çıkarımı: Mahkeme adı, Esas No, Karar No, Belge Türü, E-İmza imzacıları
- Zengin Markdown ve Düz Metin Dönüşümü (Paragraflar, Başlıklar, Tablolar)

Lisans: MIT
Organizasyon: eimza-kep (https://github.com/eimza-kep)
"""

import os
import re
import sys
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Dict, Any, Optional, Iterator, Union

# Opsiyonel LangChain & LlamaIndex entegrasyonu (Graceful Fallback)
try:
    from langchain_core.documents import Document as LCDocument
    from langchain_core.document_loaders.base import BaseLoader as LCBaseLoader
except ImportError:
    LCDocument = None
    LCBaseLoader = object

try:
    from llama_index.core.schema import Document as LlamaDocument
    from llama_index.core.readers.base import BaseReader as LlamaBaseReader
except ImportError:
    LlamaDocument = None
    LlamaBaseReader = object


class Document:
    """LangChain / LlamaIndex kurulu olmadığında kullanılan standart Doküman sınıfı."""
    def __init__(self, page_content: str, metadata: Optional[Dict[str, Any]] = None):
        self.page_content = page_content
        self.metadata = metadata or {}

    def __repr__(self) -> str:
        snippet = (self.page_content[:60] + "...") if len(self.page_content) > 60 else self.page_content
        return f"Document(page_content='{snippet}', metadata={self.metadata})"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_content": self.page_content,
            "metadata": self.metadata
        }


def extract_signers_from_xml(xml_content: str) -> List[Dict[str, Optional[str]]]:
    """XML içeriğindeki e-imza ve imzacı bilgilerini ayıklar."""
    signers = []
    
    # 1. <signer name="..." date="..." role="..." issuer="...">
    signer_pattern = re.compile(r'<signer\b([^>]*)>', re.IGNORECASE)
    for match in signer_pattern.finditer(xml_content):
        attrs = match.group(1)
        name_m = re.search(r'name=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        date_m = re.search(r'date=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        role_m = re.search(r'role=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        issuer_m = re.search(r'issuer=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        if name_m:
            name = name_m.group(1).strip()
            if not any(s["name"] == name for s in signers):
                signers.append({
                    "name": name,
                    "date": date_m.group(1) if date_m else None,
                    "role": role_m.group(1) if role_m else None,
                    "issuer": issuer_m.group(1) if issuer_m else None
                })

    # 2. <imzaci adSoyad="..." tarih="..." unvan="..." kurum="...">
    imzaci_pattern = re.compile(r'<imzaci\b([^>]*)>', re.IGNORECASE)
    for match in imzaci_pattern.finditer(xml_content):
        attrs = match.group(1)
        name_m = re.search(r'(?:adSoyad|ad|name)=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        date_m = re.search(r'(?:tarih|date)=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        role_m = re.search(r'(?:unvan|gorev|role)=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        issuer_m = re.search(r'(?:kurum|saglayici|issuer)=["\']([^"\']+)["\']', attrs, re.IGNORECASE)
        if name_m:
            name = name_m.group(1).strip()
            if not any(s["name"] == name for s in signers):
                signers.append({
                    "name": name,
                    "date": date_m.group(1) if date_m else None,
                    "role": role_m.group(1) if role_m else None,
                    "issuer": issuer_m.group(1) if issuer_m else None
                })

    # 3. XML-DSIG CN= çıkarımı
    if "ds:Signature" in xml_content or "X509SubjectName" in xml_content or "X509Certificate" in xml_content:
        for cn_m in re.finditer(r'CN=([^,\/<>"\n\r]+)', xml_content, re.IGNORECASE):
            cn = cn_m.group(1).strip()
            if cn and not any(s["name"] == cn for s in signers):
                signers.append({
                    "name": cn,
                    "date": None,
                    "role": "Elektronik İmza Sahibi",
                    "issuer": None
                })

    return signers


def extract_legal_metadata(text: str) -> Dict[str, Any]:
    """Dilekçe veya karar metninden Mahkeme, Esas/Karar No ve Belge türünü tespit eder."""
    meta = {
        "court": None,
        "case_number": None,
        "decision_number": None,
        "document_type": None
    }

    # Mahkeme / Merci Regex
    court_match = re.search(
        r'((?:T\.?C\.?\s+)?(?:[A-ZÇĞİÖŞÜ0-9\.\s\/\-]{3,70})\s+(?:MAHKEMESİNE|HAKİMLİĞİNE|BAŞKANLIĞINA|MÜDÜRLÜĞÜNE|DAİRESİNE|BAŞSAVCILIĞINA|SAVCILIĞINA))',
        text,
        re.IGNORECASE
    )
    if court_match:
        court_clean = re.sub(r'\s+', ' ', court_match.group(1)).strip()
        # Temizlik: Fazla uzun veya anlamsız eşleşmeleri ele
        if len(court_clean) <= 90 and not court_clean.startswith("#"):
            meta["court"] = court_clean

    # Esas No Regex: örn "Esas No : 2026/123", "ESAS NO: 2025/456", "2024/789 E."
    esas_match = re.search(
        r'(?:ESAS\s*(?:NO|No)?\s*[:\.\/]?\s*([0-9]{4}\s*[\/\-]\s*[0-9]+)|([0-9]{4}\s*[\/\-]\s*[0-9]+)\s*E\.)',
        text,
        re.IGNORECASE
    )
    if esas_match:
        meta["case_number"] = (esas_match.group(1) or esas_match.group(2)).replace(" ", "")

    # Karar No Regex: örn "Karar No : 2026/456", "KARAR NO: 2026/99", "2024/12 K."
    karar_match = re.search(
        r'(?:KARAR\s*(?:NO|No)?\s*[:\.\/]?\s*([0-9]{4}\s*[\/\-]\s*[0-9]+)|([0-9]{4}\s*[\/\-]\s*[0-9]+)\s*K\.)',
        text,
        re.IGNORECASE
    )
    if karar_match:
        meta["decision_number"] = (karar_match.group(1) or karar_match.group(2)).replace(" ", "")

    # Belge Türü Tespiti
    upper_text = text.upper()
    if "GEREKÇELİ KARAR" in upper_text or "K A R A R" in upper_text:
        meta["document_type"] = "Gerekçeli Karar"
    elif "TENSİP ZAPTI" in upper_text or "TENSİP TUTANAĞI" in upper_text:
        meta["document_type"] = "Tensip Zaptı"
    elif "DAVA DİLEKÇESİ" in upper_text:
        meta["document_type"] = "Dava Dilekçesi"
    elif "CEVAP DİLEKÇESİ" in upper_text:
        meta["document_type"] = "Cevap Dilekçesi"
    elif "İHTARNAME" in upper_text:
        meta["document_type"] = "İhtarname"
    elif "BİLİRKİŞİ RAPORU" in upper_text:
        meta["document_type"] = "Bilirkişi Raporu"
    elif "İCRA EMRİ" in upper_text or "ÖDEME EMRİ" in upper_text:
        meta["document_type"] = "İcra / Ödeme Emri"
    elif "DURUŞMA TUTANAĞI" in upper_text or "CELSE TUTANAĞI" in upper_text:
        meta["document_type"] = "Duruşma Tutanağı"
    elif meta["court"]:
        meta["document_type"] = "Hukuki Başvuru / Dilekçe"

    return meta


def parse_udf_xml_to_markdown(xml_text: str) -> str:
    """UYAP UDF XML şablonunu yapılandırılmış Markdown formatına dönüştürür."""
    md_lines = []
    
    # regex tabanlı paragraf ve tablo ayrıştırma
    element_regex = re.compile(r'<(paragraph|table)\b([^>]*)>([\s\S]*?)<\/\1>', re.IGNORECASE)
    
    for match in element_regex.finditer(xml_text):
        tag_type = match.group(1).lower()
        attrs = match.group(2)
        inner = match.group(3)

        if tag_type == "paragraph":
            align_match = re.search(r'alignment\s*=\s*["\'](\d+)["\']', attrs, re.IGNORECASE)
            alignment = align_match.group(1) if align_match else "0"

            content_regex = re.compile(r'<content\b([^>]*)>([\s\S]*?)<\/content>', re.IGNORECASE)
            text_parts = []
            max_font_size = 12
            is_all_bold = True
            has_content = False

            for c_match in content_regex.finditer(inner):
                c_attrs = c_match.group(1)
                raw_text = c_match.group(2)
                # XML karakter çözücü
                raw_text = (raw_text.replace("&lt;", "<")
                                    .replace("&gt;", ">")
                                    .replace("&quot;", '"')
                                    .replace("&apos;", "'")
                                    .replace("&amp;", "&"))
                if not raw_text:
                    continue

                has_content = True
                is_bold = bool(re.search(r'bold\s*=\s*["\']true["\']', c_attrs, re.IGNORECASE))
                is_italic = bool(re.search(r'italic\s*=\s*["\']true["\']', c_attrs, re.IGNORECASE))
                size_match = re.search(r'fontSize\s*=\s*["\'](\d+)["\']', c_attrs, re.IGNORECASE)
                font_size = int(size_match.group(1)) if size_match else 12
                if font_size > max_font_size:
                    max_font_size = font_size
                if not is_bold:
                    is_all_bold = False

                formatted = raw_text
                if is_bold and is_italic:
                    formatted = f"***{formatted}***"
                elif is_bold:
                    formatted = f"**{formatted}**"
                elif is_italic:
                    formatted = f"*{formatted}*"

                text_parts.append(formatted)

            if not has_content:
                continue

            full_line = "".join(text_parts).strip()
            if not full_line:
                continue

            # Başlık tespiti: Ortalı (alignment 2) veya büyük puntolu
            clean_plain = re.sub(r'[*_~`]', '', full_line).strip()
            if (alignment == "2" and (max_font_size >= 14 or is_all_bold)) and len(clean_plain) < 120:
                md_lines.append(f"# {clean_plain}")
            elif max_font_size >= 14 and len(clean_plain) < 120:
                md_lines.append(f"## {clean_plain}")
            else:
                md_lines.append(full_line)

        elif tag_type == "table":
            rows = []
            row_regex = re.compile(r'<row\b[^>]*>([\s\S]*?)<\/row>', re.IGNORECASE)
            for r_match in row_regex.finditer(inner):
                row_inner = r_match.group(1)
                cell_regex = re.compile(r'<cell\b[^>]*>([\s\S]*?)<\/cell>', re.IGNORECASE)
                cells = []
                for cell_match in cell_regex.finditer(row_inner):
                    c_inner = cell_match.group(1)
                    # Hücre içindeki content metinlerini birleştir
                    content_parts = re.findall(r'<content\b[^>]*>([\s\S]*?)<\/content>', c_inner, re.IGNORECASE)
                    cell_text = " ".join(content_parts).strip()
                    cell_text = (cell_text.replace("&lt;", "<")
                                          .replace("&gt;", ">")
                                          .replace("&quot;", '"')
                                          .replace("&apos;", "'")
                                          .replace("&amp;", "&"))
                    cell_text = re.sub(r'\s+', ' ', cell_text).replace("|", "\\|")
                    cells.append(cell_text)
                if cells:
                    rows.append(cells)

            if rows:
                col_count = max(len(r) for r in rows)
                header_row = rows[0] + [""] * (col_count - len(rows[0]))
                md_table = ["| " + " | ".join(header_row) + " |"]
                md_table.append("| " + " | ".join(["---"] * col_count) + " |")
                for r in rows[1:]:
                    padded_row = r + [""] * (col_count - len(r))
                    md_table.append("| " + " | ".join(padded_row) + " |")
                md_lines.append("\n" + "\n".join(md_table) + "\n")

    return "\n\n".join(md_lines).strip() + "\n"


def parse_udf(file_input: Union[str, Path, bytes], to_markdown: bool = True) -> Dict[str, Any]:
    """
    UDF dosya yolunu veya ham bayt verisini ayrıştırır.
    
    Dönüş Değeri:
    {
        "content_markdown": str,
        "content_text": str,
        "metadata": {
            "court": str,
            "case_number": str,
            "decision_number": str,
            "document_type": str,
            "signers": list,
            "word_count": int,
            "character_count": int,
            "file_name": str,
            "file_size": int
        }
    }
    """
    file_bytes = None
    file_name = "document.udf"
    file_size = 0

    if isinstance(file_input, (str, Path)):
        p = Path(file_input)
        file_name = p.name
        with open(p, "rb") as f:
            file_bytes = f.read()
        file_size = len(file_bytes)
    elif isinstance(file_input, bytes):
        file_bytes = file_input
        file_size = len(file_bytes)
    else:
        raise ValueError("file_input parametresi dosya yolu (str/Path) veya bytes olmalıdır.")

    xml_text = None
    signers = []

    # 1. Zip dosyasından content.xml okuma
    import io
    if zipfile.is_zipfile(io.BytesIO(file_bytes)):
        with zipfile.ZipFile(io.BytesIO(file_bytes), 'r') as zf:
            name_list = zf.namelist()
            target_xml = None
            for name in name_list:
                if name.lower() == "content.xml" or name.lower().endswith("/content.xml"):
                    target_xml = name
                    break
            if not target_xml:
                for name in name_list:
                    if name.lower().endswith(".xml"):
                        target_xml = name
                        break
            
            if target_xml:
                xml_data = zf.read(target_xml)
                try:
                    xml_text = xml_data.decode("utf-8")
                except UnicodeDecodeError:
                    xml_text = xml_data.decode("windows-1254", errors="replace")

            # İmza dosyasını kontrol et
            for name in name_list:
                if "signature" in name.lower() and name.lower().endswith(".xml"):
                    try:
                        sig_data = zf.read(name).decode("utf-8", errors="replace")
                        signers.extend(extract_signers_from_xml(sig_data))
                    except Exception:
                        pass
    else:
        # Ham XML desteği
        try:
            xml_text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                xml_text = file_bytes.decode("windows-1254")
            except Exception:
                xml_text = file_bytes.decode("utf-8", errors="replace")

    if not xml_text or ("<template" not in xml_text and "<?xml" not in xml_text and "<elements" not in xml_text):
        raise ValueError("Geçerli bir UDF veya UYAP XML içeriği bulunamadı.")

    # İmzacıları ana XML'den de topla
    xml_signers = extract_signers_from_xml(xml_text)
    for s in xml_signers:
        if not any(existing["name"] == s["name"] for existing in signers):
            signers.append(s)

    markdown_content = parse_udf_xml_to_markdown(xml_text)
    clean_text = re.sub(r'[*#`~_]', '', markdown_content)
    clean_text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', clean_text)
    clean_text = re.sub(r'<[^>]+>', '', clean_text)
    clean_text = re.sub(r'\n{3,}', '\n\n', clean_text).strip()

    legal_meta = extract_legal_metadata(markdown_content)
    word_count = len(re.findall(r'\b\S+\b', markdown_content))
    char_count = len(markdown_content)

    metadata = {
        "source": str(file_input) if isinstance(file_input, (str, Path)) else file_name,
        "file_name": file_name,
        "file_size_bytes": file_size,
        "word_count": word_count,
        "character_count": char_count,
        "court": legal_meta["court"],
        "case_number": legal_meta["case_number"],
        "decision_number": legal_meta["decision_number"],
        "document_type": legal_meta["document_type"],
        "signers": signers,
        "signer_count": len(signers),
        "has_signatures": len(signers) > 0
    }

    return {
        "content_markdown": markdown_content,
        "content_text": clean_text,
        "metadata": metadata
    }


class UDFLoader(LCBaseLoader):
    """
    LangChain uyumlu UDF Doküman Yükleyici (DocumentLoader).
    
    Kullanım:
        from udf_loader import UDFLoader
        
        loader = UDFLoader("dilekce.udf")
        docs = loader.load()
        print(docs[0].page_content)
        print(docs[0].metadata)
    """

    def __init__(
        self,
        file_path_or_dir: Union[str, Path],
        to_markdown: bool = True,
        recursive: bool = False
    ):
        self.file_path_or_dir = Path(file_path_or_dir)
        self.to_markdown = to_markdown
        self.recursive = recursive

    def lazy_load(self) -> Iterator[Any]:
        """UDF belgelerini hafızayı yormadan tembel (lazy) yükler."""
        if self.file_path_or_dir.is_file():
            files = [self.file_path_or_dir]
        elif self.file_path_or_dir.is_dir():
            pattern = "**/*" if self.recursive else "*"
            files = [
                p for p in self.file_path_or_dir.glob(pattern)
                if p.suffix.lower() in [".udf", ".xml"] and p.is_file()
            ]
        else:
            raise FileNotFoundError(f"Dosya veya dizin bulunamadı: {self.file_path_or_dir}")

        for file_path in files:
            parsed = parse_udf(file_path, to_markdown=self.to_markdown)
            content = parsed["content_markdown"] if self.to_markdown else parsed["content_text"]
            meta = parsed["metadata"]

            if LCDocument is not None:
                yield LCDocument(page_content=content, metadata=meta)
            else:
                yield Document(page_content=content, metadata=meta)

    def load(self) -> List[Any]:
        """Tüm belgeleri liste halinde yükler."""
        return list(self.lazy_load())


class UDFReader(LlamaBaseReader):
    """
    LlamaIndex uyumlu UDF Doküman Okuyucu (Reader).
    
    Kullanım:
        from udf_loader import UDFReader
        
        reader = UDFReader()
        documents = reader.load_data(Path("karar.udf"))
    """

    def __init__(self, to_markdown: bool = True):
        self.to_markdown = to_markdown

    def load_data(
        self,
        file: Union[Path, str],
        extra_info: Optional[Dict[str, Any]] = None
    ) -> List[Any]:
        file_path = Path(file)
        if not file_path.exists():
            raise FileNotFoundError(f"UDF dosyası bulunamadı: {file_path}")

        parsed = parse_udf(file_path, to_markdown=self.to_markdown)
        content = parsed["content_markdown"] if self.to_markdown else parsed["content_text"]
        metadata = parsed["metadata"]
        if extra_info:
            metadata.update(extra_info)

        if LlamaDocument is not None:
            return [LlamaDocument(text=content, metadata=metadata)]
        else:
            return [Document(page_content=content, metadata=metadata)]


def main():
    import argparse
    parser = argparse.ArgumentParser(description="UYAP UDF LangChain/LlamaIndex Document Loader v1.4")
    parser.add_argument("path", help="UDF/XML dosyası veya taranacak klasör yolu")
    parser.add_argument("--json", action="store_true", help="JSON formatında çıktı üretir")
    parser.add_argument("--text", action="store_true", help="Markdown yerine yalın metin üretir")
    parser.add_argument("--output", "-o", help="Çıktıyı dosyaya kaydeder")
    parser.add_argument("-r", "--recursive", action="store_true", help="Klasörü özyinelemeli tara")

    args = parser.parse_args()

    loader = UDFLoader(args.path, to_markdown=(not args.text), recursive=args.recursive)
    docs = loader.load()

    if args.json:
        data = [
            {
                "page_content": d.page_content,
                "metadata": d.metadata
            }
            for d in docs
        ]
        out_str = json.dumps(data, indent=2, ensure_ascii=False)
    else:
        out_str = "\n\n---\n\n".join(
            f"# {d.metadata.get('file_name', 'Belge')}\n"
            f"**Mahkeme:** {d.metadata.get('court') or 'Belirtilmemiş'}\n"
            f"**Esas No:** {d.metadata.get('case_number') or 'Belirtilmemiş'}\n"
            f"**Karar No:** {d.metadata.get('decision_number') or 'Belirtilmemiş'}\n"
            f"**Belge Türü:** {d.metadata.get('document_type') or 'Belirtilmemiş'}\n\n"
            f"{d.page_content}"
            for d in docs
        )

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out_str)
        print(f"[Başarılı] {len(docs)} belge '{args.output}' dosyasına kaydedildi.")
    else:
        print(out_str)


if __name__ == "__main__":
    main()
