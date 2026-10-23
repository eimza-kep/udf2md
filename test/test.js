const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
    convertXmlToMarkdown,
    extractSigners,
    extractLegalMetadata,
    generateFrontmatter,
    findUdfFilesRecursively
} = require("../cli.js");

console.log("Running udf2md unit tests...");

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<template format_id="1.8">
  <properties>
    <pageFormat leftMargin="70.86" rightMargin="70.86"/>
  </properties>
  <elements>
    <paragraph alignment="2">
      <content fontName="Times New Roman" fontSize="18" bold="true">ANKARA ASLİYE TİCARET MAHKEMESİNE</content>
    </paragraph>
    <paragraph alignment="0">
      <content fontName="Times New Roman" fontSize="12" bold="true">ESAS NO : 2026/123</content>
    </paragraph>
    <paragraph alignment="0">
      <content fontName="Times New Roman" fontSize="12" bold="true">KARAR NO: 2026/456</content>
    </paragraph>
    <paragraph alignment="2">
      <content fontName="Times New Roman" fontSize="14" bold="true">GEREKÇELİ KARAR</content>
    </paragraph>
    <paragraph alignment="3">
      <content fontName="Times New Roman" fontSize="12" bold="true">DAVACI:</content>
      <content fontName="Times New Roman" fontSize="12"> Ahmet Yılmaz (TC: 12345678901)</content>
    </paragraph>
    <paragraph alignment="3">
      <content fontName="Times New Roman" fontSize="12">Davanın </content>
      <content fontName="Times New Roman" fontSize="12" bold="true" italic="true">kabulünü</content>
      <content fontName="Times New Roman" fontSize="12"> arz ederiz.</content>
    </paragraph>
    <table>
      <row>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11" bold="true">Fatura No</content></paragraph></cell>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11" bold="true">Tutar</content></paragraph></cell>
      </row>
      <row>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11">ABC2026001</content></paragraph></cell>
        <cell><paragraph><content fontName="Times New Roman" fontSize="11">15.000 TL</content></paragraph></cell>
      </row>
    </table>
  </elements>
  <signers>
    <signer name="Av. Mehmet Öz" date="2026-10-15 14:30:00" role="Davacı Vekili" issuer="TÜRKTRUST"/>
  </signers>
</template>`;

// Test 1: Markdown Conversion
const md = convertXmlToMarkdown(sampleXml, []);
assert(md.includes("# ANKARA ASLİYE TİCARET MAHKEMESİNE"), "Heading 1 should be generated");
assert(md.includes("**DAVACI:**"), "Bold text formatting should be preserved");
assert(md.includes("***kabulünü***"), "Bold + italic formatting should be preserved");
assert(md.includes("| Fatura No | Tutar |"), "Table header should be generated");
assert(md.includes("| ABC2026001 | 15.000 TL |"), "Table row should be generated");

// Test 2: Signer extraction
const signers = extractSigners(sampleXml);
assert.strictEqual(signers.length, 1, "Should extract exactly 1 signer");
assert.strictEqual(signers[0].name, "Av. Mehmet Öz", "Signer name should match");
assert.strictEqual(signers[0].role, "Davacı Vekili", "Signer role should match");
assert.strictEqual(signers[0].issuer, "TÜRKTRUST", "Signer issuer should match");

// Test 3: Legal metadata extraction (Court, Esas No, Karar No, Document Type)
const legalMeta = extractLegalMetadata(md, sampleXml);
assert(legalMeta.court && legalMeta.court.includes("ANKARA ASLİYE TİCARET MAHKEMESİNE"), "Court name should be extracted");
assert.strictEqual(legalMeta.case_number, "2026/123", "Case number should match 2026/123");
assert.strictEqual(legalMeta.decision_number, "2026/456", "Decision number should match 2026/456");
assert.strictEqual(legalMeta.document_type, "Gerekçeli Karar", "Document type should match Gerekçeli Karar");

// Test 4: Frontmatter generation with legal metadata
const payload = {
    file_name: "ornek_karar.udf",
    converted_at: "2026-10-20T12:00:00Z",
    court: legalMeta.court,
    case_number: legalMeta.case_number,
    decision_number: legalMeta.decision_number,
    document_type: legalMeta.document_type,
    word_count: 50,
    character_count: 320,
    signers: signers
};
const fm = generateFrontmatter(payload);
assert(fm.startsWith("---\n"), "Frontmatter must start with delimiter ---");
assert(fm.includes('title: "ornek_karar.udf"'), "Title should be in frontmatter");
assert(fm.includes('court: "ANKARA ASLİYE TİCARET MAHKEMESİNE"'), "Court should be in frontmatter");
assert(fm.includes('case_number: "2026/123"'), "Case number should be in frontmatter");
assert(fm.includes('decision_number: "2026/456"'), "Decision number should be in frontmatter");
assert(fm.includes('document_type: "Gerekçeli Karar"'), "Document type should be in frontmatter");
assert(fm.includes('name: "Av. Mehmet Öz"'), "Signer name should be in frontmatter");
assert(fm.includes('role: "Davacı Vekili"'), "Signer role should be in frontmatter");

// Test 5: Recursive file discovery
const dummyDir = path.join(__dirname, "temp_batch_test");
const subDir = path.join(dummyDir, "subfolder");
try {
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(dummyDir, "doc1.udf"), sampleXml);
    fs.writeFileSync(path.join(subDir, "doc2.xml"), sampleXml);
    fs.writeFileSync(path.join(subDir, "ignore.txt"), "ignored text");

    const foundFiles = findUdfFilesRecursively(dummyDir);
    assert.strictEqual(foundFiles.length, 2, "Recursive search should find exactly 2 .udf/.xml files");
} finally {
    if (fs.existsSync(dummyDir)) {
        fs.rmSync(dummyDir, { recursive: true, force: true });
    }
}

console.log("All Node.js unit tests (Markdown, E-İmza Signers, Legal Metadata, Frontmatter, Recursive Batch) passed successfully!");
