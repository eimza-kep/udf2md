#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for UDF LangChain/LlamaIndex Document Loader v1.4"""

import os
import io
import zipfile
import unittest
from pathlib import Path
from udf_loader import (
    parse_udf,
    parse_udf_xml_to_markdown,
    extract_legal_metadata,
    extract_signers_from_xml,
    UDFLoader,
    UDFReader,
    Document
)

SAMPLE_UDF_XML = """<?xml version="1.0" encoding="UTF-8"?>
<template format_id="1.8">
  <properties>
    <pageFormat leftMargin="70.86" rightMargin="70.86"/>
  </properties>
  <elements>
    <paragraph alignment="2">
      <content fontName="Times New Roman" fontSize="18" bold="true">ANKARA 2. ASLİYE TİCARET MAHKEMESİNE</content>
    </paragraph>
    <paragraph alignment="0">
      <content fontName="Times New Roman" fontSize="12" bold="true">ESAS NO : 2026/1042</content>
    </paragraph>
    <paragraph alignment="0">
      <content fontName="Times New Roman" fontSize="12" bold="true">KARAR NO: 2026/512</content>
    </paragraph>
    <paragraph alignment="2">
      <content fontName="Times New Roman" fontSize="14" bold="true">GEREKÇELİ KARAR</content>
    </paragraph>
    <paragraph alignment="3">
      <content fontName="Times New Roman" fontSize="12" bold="true">DAVACI:</content>
      <content fontName="Times New Roman" fontSize="12"> Test Bilişim A.Ş.</content>
    </paragraph>
    <paragraph alignment="3">
      <content fontName="Times New Roman" fontSize="12">Davanın </content>
      <content fontName="Times New Roman" fontSize="12" bold="true" italic="true">kabulüne</content>
      <content fontName="Times New Roman" fontSize="12"> karar verildi.</content>
    </paragraph>
    <table>
      <row>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11" bold="true">Kalem</content></paragraph></cell>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11" bold="true">Bedel</content></paragraph></cell>
      </row>
      <row>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11">Yazılım Lisansı</content></paragraph></cell>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11">50.000 TL</content></paragraph></cell>
      </row>
    </table>
  </elements>
  <signers>
    <signer name="Hâkim Fatma Şahin" date="2026-10-18 16:45:00" role="Mahkeme Başkanı" issuer="TÜBİTAK BİLGEM"/>
  </signers>
</template>"""

def create_sample_udf_zip(xml_content: str) -> bytes:
    """Bellek içinde geçerli bir .udf (zip) arşivi üretir."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("content.xml", xml_content.encode("utf-8"))
    return buf.getvalue()


class TestUDFLoader(unittest.TestCase):

    def test_markdown_and_table_conversion(self):
        md = parse_udf_xml_to_markdown(SAMPLE_UDF_XML)
        self.assertIn("# ANKARA 2. ASLİYE TİCARET MAHKEMESİNE", md)
        self.assertIn("**DAVACI:**", md)
        self.assertIn("***kabulüne***", md)
        self.assertIn("| Kalem | Bedel |", md)
        self.assertIn("| Yazılım Lisansı | 50.000 TL |", md)

    def test_legal_metadata_extraction(self):
        meta = extract_legal_metadata(SAMPLE_UDF_XML)
        self.assertIsNotNone(meta["court"])
        self.assertIn("ANKARA 2. ASLİYE TİCARET MAHKEMESİNE", meta["court"])
        self.assertEqual(meta["case_number"], "2026/1042")
        self.assertEqual(meta["decision_number"], "2026/512")
        self.assertEqual(meta["document_type"], "Gerekçeli Karar")

    def test_signer_extraction(self):
        signers = extract_signers_from_xml(SAMPLE_UDF_XML)
        self.assertEqual(len(signers), 1)
        self.assertEqual(signers[0]["name"], "Hâkim Fatma Şahin")
        self.assertEqual(signers[0]["role"], "Mahkeme Başkanı")
        self.assertEqual(signers[0]["issuer"], "TÜBİTAK BİLGEM")

    def test_parse_udf_from_zip_bytes(self):
        zip_bytes = create_sample_udf_zip(SAMPLE_UDF_XML)
        parsed = parse_udf(zip_bytes)
        self.assertTrue(parsed["content_markdown"].startswith("# ANKARA 2. ASLİYE"))
        self.assertEqual(parsed["metadata"]["case_number"], "2026/1042")
        self.assertEqual(parsed["metadata"]["decision_number"], "2026/512")
        self.assertEqual(parsed["metadata"]["signer_count"], 1)
        self.assertTrue(parsed["metadata"]["has_signatures"])

    def test_udf_loader_file_and_lazy_load(self):
        temp_file = Path(__file__).parent / "temp_test_doc.udf"
        try:
            zip_bytes = create_sample_udf_zip(SAMPLE_UDF_XML)
            with open(temp_file, "wb") as f:
                f.write(zip_bytes)

            loader = UDFLoader(str(temp_file), to_markdown=True)
            docs = loader.load()
            self.assertEqual(len(docs), 1)
            doc = docs[0]
            self.assertIn("ANKARA 2. ASLİYE TİCARET", doc.page_content)
            self.assertEqual(doc.metadata["case_number"], "2026/1042")
            self.assertEqual(doc.metadata["document_type"], "Gerekçeli Karar")

            # Lazy load test
            lazy_docs = list(loader.lazy_load())
            self.assertEqual(len(lazy_docs), 1)
            self.assertEqual(lazy_docs[0].metadata["decision_number"], "2026/512")
        finally:
            if temp_file.exists():
                temp_file.unlink()

    def test_udf_reader_llamaindex(self):
        temp_file = Path(__file__).parent / "temp_test_reader.udf"
        try:
            zip_bytes = create_sample_udf_zip(SAMPLE_UDF_XML)
            with open(temp_file, "wb") as f:
                f.write(zip_bytes)

            reader = UDFReader(to_markdown=True)
            docs = reader.load_data(temp_file, extra_info={"department": "Hukuk Müşavirliği"})
            self.assertEqual(len(docs), 1)
            doc = docs[0]
            self.assertEqual(doc.metadata["department"], "Hukuk Müşavirliği")
            self.assertEqual(doc.metadata["case_number"], "2026/1042")
        finally:
            if temp_file.exists():
                temp_file.unlink()


if __name__ == "__main__":
    unittest.main()
