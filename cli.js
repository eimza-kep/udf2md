#!/usr/bin/env node
/**
 * udf2md CLI — UYAP UDF to Markdown & LLM/RAG Converter v1.4
 * Usage:
 *   node cli.js <input.udf|input.xml> [output.md]
 *   node cli.js ./dosyalar/ --output-dir ./markdown/ --recursive
 *   node cli.js dilekce.udf --with-frontmatter
 *   node cli.js karar.udf --json
 */

const fs = require("fs");
const path = require("path");

function printHelp() {
    console.log(`
udf2md — UYAP UDF to Markdown Converter (CLI) v1.4

Kullanım:
  node cli.js <dosya.udf|dosya.xml|klasör> [cikti.md] [seçenekler]

Seçenekler:
  -o, --output <dosya>          Çıktı Markdown dosya yolu (varsayılan: stdout veya <dosya>.md)
  --output-dir <dizin>          Toplu dönüştürmede çıktıların kaydedileceği dizin
  -r, --recursive               Belirtilen klasördeki tüm .udf ve .xml dosyalarını özyinelemeli tara
  -f, --with-frontmatter        Belge başlığı, mahkeme, esas/karar no ve e-imza metaverilerini YAML frontmatter olarak ekle
  -t, --text                    Markdown etiketlerinden arındırılmış yalın metin (clean text) üretir
  -i, --extract-images          UDF içindeki görselleri klasöre çıkar
  -j, --json                    Çıktıyı ve hukuki meta verileri JSON formatında üretir (LLM / RAG uyumlu)
  -m, --metadata                Sadece belge meta verilerini (mahkeme, esas no, boyut, e-imza vb.) gösterir
  -h, --help                    Bu yardım mesajını göster
  -v, --version                 Sürüm bilgisini göster

Örnekler:
  node cli.js dilekce.udf
  node cli.js dilekce.udf dilekce.md --with-frontmatter
  node cli.js ./evraklar/ --output-dir ./md_cikti/ --recursive
  node cli.js karar.udf --json
`);
}

function extractSigners(xmlText, zip) {
    const signers = [];
    if (!xmlText) return signers;

    // 1. <signer name="..." date="..." role="..." issuer="...">
    const signerRegex = /<signer\b([^>]*)>/gi;
    let sm;
    while ((sm = signerRegex.exec(xmlText)) !== null) {
        const attrs = sm[1];
        const name = (attrs.match(/name=["']([^"']+)["']/i) || [])[1];
        const date = (attrs.match(/date=["']([^"']+)["']/i) || [])[1];
        const role = (attrs.match(/role=["']([^"']+)["']/i) || [])[1];
        const issuer = (attrs.match(/issuer=["']([^"']+)["']/i) || [])[1];
        if (name && !signers.some(s => s.name === name)) {
            signers.push({ name, date: date || null, role: role || null, issuer: issuer || null });
        }
    }

    // 2. <imzaci adSoyad="..." tarih="..." unvan="..." kurum="...">
    const imzaciRegex = /<imzaci\b([^>]*)>/gi;
    let im;
    while ((im = imzaciRegex.exec(xmlText)) !== null) {
        const attrs = im[1];
        const name = (attrs.match(/(?:adSoyad|ad|name)=["']([^"']+)["']/i) || [])[1];
        const date = (attrs.match(/(?:tarih|date)=["']([^"']+)["']/i) || [])[1];
        const role = (attrs.match(/(?:unvan|gorev|role)=["']([^"']+)["']/i) || [])[1];
        const issuer = (attrs.match(/(?:kurum|saglayici|issuer)=["']([^"']+)["']/i) || [])[1];
        if (name && !signers.some(s => s.name === name)) {
            signers.push({ name, date: date || null, role: role || null, issuer: issuer || null });
        }
    }

    // 3. XML-DSIG X509SubjectName CN=
    if (xmlText.includes("ds:Signature") || xmlText.includes("X509Certificate") || xmlText.includes("X509SubjectName")) {
        const cnRegex = /CN=([^,\/<>"\n\r]+)/gi;
        let cnm;
        while ((cnm = cnRegex.exec(xmlText)) !== null) {
            const cn = cnm[1].trim();
            if (cn && !signers.some(s => s.name === cn)) {
                signers.push({ name: cn, date: null, role: "Elektronik İmza Sahibi", issuer: null });
            }
        }
    }

    return signers;
}

function extractLegalMetadata(text, xmlText) {
    const meta = {
        court: null,
        case_number: null,
        decision_number: null,
        document_type: null
    };

    if (!text && !xmlText) return meta;
    const combined = (text || "") + "\n" + (xmlText || "");

    // 1. Mahkeme Adı
    const courtMatch = combined.match(
        /((?:T\.?C\.?\s+)?(?:[A-ZÇĞİÖŞÜ0-9\.\s\/\-]{3,70})\s+(?:MAHKEMESİNE|HAKİMLİĞİNE|BAŞKANLIĞINA|MÜDÜRLÜĞÜNE|DAİRESİNE|BAŞSAVCILIĞINA|SAVCILIĞINA))/i
    );
    if (courtMatch) {
        const cleanCourt = courtMatch[1].replace(/\s+/g, " ").trim();
        if (cleanCourt.length <= 90 && !cleanCourt.startsWith("#")) {
            meta.court = cleanCourt;
        }
    }

    // 2. Esas No: örn "Esas No : 2026/123", "ESAS NO: 2025/456", "2024/789 E."
    const esasMatch = combined.match(
        /(?:ESAS\s*(?:NO|No)?\s*[:\.\/]?\s*([0-9]{4}\s*[\/\-]\s*[0-9]+)|([0-9]{4}\s*[\/\-]\s*[0-9]+)\s*E\.)/i
    );
    if (esasMatch) {
        meta.case_number = (esasMatch[1] || esasMatch[2]).replace(/\s+/g, "");
    }

    // 3. Karar No: örn "Karar No : 2026/456", "KARAR NO: 2026/99", "2024/12 K."
    const kararMatch = combined.match(
        /(?:KARAR\s*(?:NO|No)?\s*[:\.\/]?\s*([0-9]{4}\s*[\/\-]\s*[0-9]+)|([0-9]{4}\s*[\/\-]\s*[0-9]+)\s*K\.)/i
    );
    if (kararMatch) {
        meta.decision_number = (kararMatch[1] || kararMatch[2]).replace(/\s+/g, "");
    }

    // 4. Belge Türü Tespiti
    const upper = combined.toUpperCase();
    if (upper.includes("GEREKÇELİ KARAR") || upper.includes("K A R A R")) {
        meta.document_type = "Gerekçeli Karar";
    } else if (upper.includes("TENSİP ZAPTI") || upper.includes("TENSİP TUTANAĞI")) {
        meta.document_type = "Tensip Zaptı";
    } else if (upper.includes("DAVA DİLEKÇESİ")) {
        meta.document_type = "Dava Dilekçesi";
    } else if (upper.includes("CEVAP DİLEKÇESİ")) {
        meta.document_type = "Cevap Dilekçesi";
    } else if (upper.includes("İHTARNAME")) {
        meta.document_type = "İhtarname";
    } else if (upper.includes("BİLİRKİŞİ RAPORU")) {
        meta.document_type = "Bilirkişi Raporu";
    } else if (upper.includes("İCRA EMRİ") || upper.includes("ÖDEME EMRİ")) {
        meta.document_type = "İcra / Ödeme Emri";
    } else if (upper.includes("DURUŞMA TUTANAĞI") || upper.includes("CELSE TUTANAĞI")) {
        meta.document_type = "Duruşma Tutanağı";
    } else if (meta.court) {
        meta.document_type = "Hukuki Başvuru / Dilekçe";
    }

    return meta;
}

function generateFrontmatter(payload) {
    let fm = "---\n";
    fm += `title: "${payload.file_name.replace(/"/g, '\\"')}"\n`;
    if (payload.court) fm += `court: "${payload.court.replace(/"/g, '\\"')}"\n`;
    if (payload.case_number) fm += `case_number: "${payload.case_number}"\n`;
    if (payload.decision_number) fm += `decision_number: "${payload.decision_number}"\n`;
    if (payload.document_type) fm += `document_type: "${payload.document_type}"\n`;
    fm += `converted_at: "${payload.converted_at}"\n`;
    fm += `word_count: ${payload.word_count}\n`;
    fm += `character_count: ${payload.character_count}\n`;
    if (payload.signers && payload.signers.length > 0) {
        fm += `signers:\n`;
        payload.signers.forEach(s => {
            fm += `  - name: "${s.name}"\n`;
            if (s.role) fm += `    role: "${s.role}"\n`;
            if (s.date) fm += `    date: "${s.date}"\n`;
            if (s.issuer) fm += `    issuer: "${s.issuer}"\n`;
        });
    }
    fm += "---\n\n";
    return fm;
}

async function parseUdfBuffer(fileBuffer, options = {}) {
    const JSZip = require("./js/jszip.min.js");
    let xmlText = null;
    const images = [];
    let zipInstance = null;

    try {
        const zip = await JSZip.loadAsync(fileBuffer);
        zipInstance = zip;
        let contentFile = null;
        zip.forEach((relPath, entry) => {
            const lower = relPath.toLowerCase();
            if (lower === "content.xml" || lower.endsWith("/content.xml")) {
                contentFile = entry;
            }
        });

        if (!contentFile) {
            zip.forEach((relPath, entry) => {
                if (relPath.toLowerCase().endsWith(".xml") && !contentFile) {
                    contentFile = entry;
                }
            });
        }

        if (contentFile) {
            xmlText = await contentFile.async("string");
        }

        // Check for signature.xml or signatures.xml
        zip.forEach(async (relPath, entry) => {
            const lower = relPath.toLowerCase();
            if (lower.includes("signature") && lower.endsWith(".xml")) {
                try {
                    const sigText = await entry.async("string");
                    xmlText = (xmlText || "") + "\n" + sigText;
                } catch (e) {}
            }
        });

        // Extract images
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".svg"];
        for (const [p, entry] of Object.entries(zip.files)) {
            const lower = p.toLowerCase();
            if (entry.dir) continue;
            if (imageExts.some(ext => lower.endsWith(ext))) {
                const base64 = await entry.async("base64");
                const ext = lower.split(".").pop();
                const mimeMap = {
                    png: "image/png",
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    gif: "image/gif",
                    bmp: "image/bmp",
                    tiff: "image/tiff",
                    tif: "image/tiff",
                    svg: "image/svg+xml"
                };
                images.push({
                    name: p.split("/").pop(),
                    base64,
                    mimeType: mimeMap[ext] || "image/png"
                });
            }
        }
    } catch (e) {
        // Plain XML fallback
        xmlText = fileBuffer.toString("utf-8");
        if (!xmlText.includes("<template") && !xmlText.includes("<?xml")) {
            try {
                const iconv = require("util").TextDecoder;
                xmlText = new iconv("windows-1254").decode(fileBuffer);
            } catch (err) {}
        }
    }

    if (!xmlText) {
        throw new Error("UDF içeriği çözülemedi veya geçerli XML bulunamadı.");
    }

    const signers = extractSigners(xmlText, zipInstance);
    const markdown = convertXmlToMarkdown(xmlText, images);
    const cleanText = markdown
        .replace(/[*_#`~>]/g, "")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const legalMeta = extractLegalMetadata(markdown, xmlText);

    return { xmlText, markdown, cleanText, images, signers, legalMeta };
}

function findUdfFilesRecursively(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(findUdfFilesRecursively(fullPath));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === ".udf" || ext === ".xml") {
                results.push(fullPath);
            }
        }
    }
    return results;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
        printHelp();
        process.exit(0);
    }

    if (args.includes("-v") || args.includes("--version")) {
        const pkg = require("./package.json");
        console.log(`udf2md v${pkg.version}`);
        process.exit(0);
    }

    let inputFile = null;
    let outputFile = null;
    let outputDir = null;
    let recursive = false;
    let withFrontmatter = false;
    let extractImages = false;
    let jsonOutput = false;
    let metadataOnly = false;
    let plainTextOnly = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-o" || arg === "--output") {
            outputFile = args[++i];
        } else if (arg === "--output-dir") {
            outputDir = args[++i];
        } else if (arg === "-r" || arg === "--recursive") {
            recursive = true;
        } else if (arg === "-f" || arg === "--with-frontmatter") {
            withFrontmatter = true;
        } else if (arg === "-t" || arg === "--text") {
            plainTextOnly = true;
        } else if (arg === "-i" || arg === "--extract-images") {
            extractImages = true;
        } else if (arg === "-j" || arg === "--json") {
            jsonOutput = true;
        } else if (arg === "-m" || arg === "--metadata") {
            metadataOnly = true;
        } else if (!arg.startsWith("-")) {
            if (!inputFile) inputFile = arg;
            else if (!outputFile) outputFile = arg;
        }
    }

    if (!inputFile) {
        console.error("Hata: Girdi dosyası veya klasörü belirtilmedi.");
        printHelp();
        process.exit(1);
    }

    const resolvedInput = path.resolve(process.cwd(), inputFile);
    if (!fs.existsSync(resolvedInput)) {
        console.error(`Hata: '${inputFile}' bulunamadı.`);
        process.exit(1);
    }

    const stat = fs.statSync(resolvedInput);

    // BATCH DIRECTORY CONVERSION MODE
    if (stat.isDirectory()) {
        const files = recursive ? findUdfFilesRecursively(resolvedInput) : fs.readdirSync(resolvedInput)
            .filter(f => [".udf", ".xml"].includes(path.extname(f).toLowerCase()))
            .map(f => path.join(resolvedInput, f));

        if (files.length === 0) {
            console.log(`[Bilgi] Belirtilen dizinde .udf veya .xml dosyası bulunamadı: ${resolvedInput}`);
            process.exit(0);
        }

        const targetDir = outputDir ? path.resolve(process.cwd(), outputDir) : resolvedInput;
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        console.log(`\n======================================================`);
        console.log(` udf2md Toplu Dönüştürme: ${files.length} Dosya İşleniyor`);
        console.log(` Hedef Dizin: ${targetDir}`);
        console.log(`======================================================`);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const baseName = path.basename(f, path.extname(f));
            const outPath = path.join(targetDir, baseName + (plainTextOnly ? ".txt" : ".md"));

            try {
                const fBuffer = fs.readFileSync(f);
                const parsed = await parseUdfBuffer(fBuffer);
                const wordCount = (parsed.markdown.match(/\b\S+\b/g) || []).length;

                let finalContent = plainTextOnly ? parsed.cleanText : parsed.markdown;
                if (withFrontmatter && !plainTextOnly) {
                    const payload = {
                        file_name: path.basename(f),
                        converted_at: new Date().toISOString(),
                        court: parsed.legalMeta ? parsed.legalMeta.court : null,
                        case_number: parsed.legalMeta ? parsed.legalMeta.case_number : null,
                        decision_number: parsed.legalMeta ? parsed.legalMeta.decision_number : null,
                        document_type: parsed.legalMeta ? parsed.legalMeta.document_type : null,
                        word_count: wordCount,
                        character_count: parsed.markdown.length,
                        signers: parsed.signers
                    };
                    finalContent = generateFrontmatter(payload) + finalContent;
                }

                fs.writeFileSync(outPath, finalContent, "utf-8");
                successCount++;
                const sigBadge = parsed.signers.length > 0 ? ` [✍️ ${parsed.signers.length} İmza]` : "";
                const metaBadge = parsed.legalMeta.case_number ? ` [⚖️ ${parsed.legalMeta.case_number}]` : "";
                console.log(` [${i + 1}/${files.length}] ✅ ${path.basename(f)} -> ${path.basename(outPath)}${metaBadge}${sigBadge}`);
            } catch (err) {
                failCount++;
                console.error(` [${i + 1}/${files.length}] ❌ ${path.basename(f)} Hata: ${err.message}`);
            }
        }

        console.log(`------------------------------------------------------`);
        console.log(`Sonuç: ${successCount} Başarılı | ${failCount} Hatalı (Toplam: ${files.length})`);
        console.log(`======================================================\n`);
        return;
    }

    // SINGLE FILE CONVERSION MODE
    const fileBuffer = fs.readFileSync(resolvedInput);
    const parsed = await parseUdfBuffer(fileBuffer);
    const wordCount = (parsed.markdown.match(/\b\S+\b/g) || []).length;
    const charCount = parsed.markdown.length;

    const payload = {
        file_name: path.basename(inputFile),
        file_path: resolvedInput,
        file_size_bytes: fileBuffer.length,
        character_count: charCount,
        word_count: wordCount,
        court: parsed.legalMeta ? parsed.legalMeta.court : null,
        case_number: parsed.legalMeta ? parsed.legalMeta.case_number : null,
        decision_number: parsed.legalMeta ? parsed.legalMeta.decision_number : null,
        document_type: parsed.legalMeta ? parsed.legalMeta.document_type : null,
        images_count: parsed.images.length,
        signers: parsed.signers,
        has_signatures: parsed.signers.length > 0,
        converted_at: new Date().toISOString()
    };

    if (metadataOnly) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    if (extractImages && parsed.images.length > 0) {
        const imgDir = path.resolve(
            path.dirname(outputFile ? path.resolve(process.cwd(), outputFile) : resolvedInput),
            path.basename(inputFile, path.extname(inputFile)) + "_images"
        );
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
        parsed.images.forEach(img => {
            const outPath = path.join(imgDir, img.name);
            fs.writeFileSync(outPath, Buffer.from(img.base64, "base64"));
        });
        console.error(`[Bilgi] ${parsed.images.length} adet görsel '${path.basename(imgDir)}/' klasörüne çıkarıldı.`);
    }

    if (jsonOutput) {
        payload.content_markdown = parsed.markdown;
        payload.content_text = parsed.cleanText;
        if (outputFile) {
            const resolvedOutput = path.resolve(process.cwd(), outputFile);
            fs.writeFileSync(resolvedOutput, JSON.stringify(payload, null, 2), "utf-8");
            console.error(`[Başarılı] JSON kaydedildi: ${outputFile}`);
        } else {
            process.stdout.write(JSON.stringify(payload, null, 2));
        }
        return;
    }

    let finalOutput = plainTextOnly ? parsed.cleanText : parsed.markdown;
    if (withFrontmatter && !plainTextOnly) {
        finalOutput = generateFrontmatter(payload) + finalOutput;
    }

    if (outputFile) {
        const resolvedOutput = path.resolve(process.cwd(), outputFile);
        fs.writeFileSync(resolvedOutput, finalOutput, "utf-8");
        console.error(`[Başarılı] ${plainTextOnly ? "Metin" : "Markdown"} kaydedildi: ${outputFile}`);
    } else {
        process.stdout.write(finalOutput);
    }
}

function convertXmlToMarkdown(xmlText, images) {
    const lines = [];

    // Parse elements with regex for zero-dependency portability
    // Match paragraphs and tables
    const elementRegex = /<(paragraph|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match;

    while ((match = elementRegex.exec(xmlText)) !== null) {
        const type = match[1].toLowerCase();
        const attrs = match[2];
        const inner = match[3];

        if (type === "paragraph") {
            const mdLine = parseParagraph(attrs, inner);
            lines.push(mdLine);
        } else if (type === "table") {
            const mdTable = parseTable(inner);
            if (mdTable) lines.push("\n" + mdTable + "\n");
        }
    }

    // Images
    if (images && images.length > 0) {
        images.forEach(img => {
            lines.push(`\n![${img.name}](data:${img.mimeType};base64,${img.base64})\n`);
        });
    }

    return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function parseParagraph(attrs, inner) {
    const alignMatch = attrs.match(/alignment\s*=\s*["'](\d+)["']/i);
    const alignment = alignMatch ? alignMatch[1] : "0";

    const contentRegex = /<content\b([^>]*)>([\s\S]*?)<\/content>/gi;
    let contentMatch;
    let textParts = [];
    let isHeading = false;
    let headingLevel = 2;

    while ((contentMatch = contentRegex.exec(inner)) !== null) {
        const cAttrs = contentMatch[1];
        const text = decodeXml(contentMatch[2]);
        if (!text) continue;

        const isBold = /bold\s*=\s*["']true["']/i.test(cAttrs);
        const isItalic = /italic\s*=\s*["']true["']/i.test(cAttrs);
        const sizeMatch = cAttrs.match(/fontSize\s*=\s*["'](\d+)["']/i);
        const fontSize = sizeMatch ? parseInt(sizeMatch[1]) : 12;

        if (fontSize >= 18 && (isBold || alignment === "2")) {
            isHeading = true;
            headingLevel = 1;
        } else if (fontSize >= 14 && isBold) {
            isHeading = true;
            headingLevel = 2;
        }

        let formatted = text;
        if (isBold && isItalic) formatted = `***${formatted}***`;
        else if (isBold) formatted = `**${formatted}**`;
        else if (isItalic) formatted = `*${formatted}*`;

        textParts.push(formatted);
    }

    const fullLine = textParts.join("").trim();
    if (!fullLine) return "";

    if (isHeading) {
        const clean = fullLine.replace(/\*{1,3}/g, "");
        return `${"#".repeat(headingLevel)} ${clean}`;
    }

    return fullLine;
}

function parseTable(inner) {
    const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
    let rowMatch;
    const rows = [];

    while ((rowMatch = rowRegex.exec(inner)) !== null) {
        const cellRegex = /<cell\b[^>]*>([\s\S]*?)<\/cell>/gi;
        let cellMatch;
        const cells = [];
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
            const text = decodeXml(cellMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
            cells.push(text.replace(/\|/g, "\\|"));
        }
        if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) return "";

    let md = "";
    const colCount = Math.max(...rows.map(r => r.length));
    rows.forEach((r, idx) => {
        while (r.length < colCount) r.push("");
        md += "| " + r.join(" | ") + " |\n";
        if (idx === 0) {
            md += "| " + r.map(() => "---").join(" | ") + " |\n";
        }
    });

    return md.trim();
}

function decodeXml(str) {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

module.exports = {
    convertXmlToMarkdown,
    extractSigners,
    extractLegalMetadata,
    generateFrontmatter,
    parseUdfBuffer,
    findUdfFilesRecursively
};

if (require.main === module) {
    main().catch(err => {
        console.error("Hata:", err.message);
        process.exit(1);
    });
}
