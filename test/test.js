const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { convertXmlToMarkdown } = require("../cli.js");

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
</template>`;

const md = convertXmlToMarkdown(sampleXml, []);

assert(md.includes("# ANKARA ASLİYE TİCARET MAHKEMESİNE"), "Heading 1 should be generated");
assert(md.includes("**DAVACI:**"), "Bold text formatting should be preserved");
assert(md.includes("***kabulünü***"), "Bold + italic formatting should be preserved");
assert(md.includes("| Fatura No | Tutar |"), "Table header should be generated");
assert(md.includes("| ABC2026001 | 15.000 TL |"), "Table row should be generated");

console.log("All unit tests passed successfully!");
