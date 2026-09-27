#!/usr/bin/env node
/**
 * udf2md CLI — UYAP UDF to Markdown Converter
 * Usage:
 *   node cli.js <input.udf|input.xml> [output.md]
 *   npx udf2md <input.udf> --extract-images
 */

const fs = require("fs");
const path = require("path");

function printHelp() {
    console.log(`
udf2md — UYAP UDF to Markdown Converter (CLI)

Kullanım:
  node cli.js <dosya.udf|dosya.xml> [cikti.md] [seçenekler]

Seçenekler:
  -o, --output <dosya>      Çıktı Markdown dosya yolu (varsayılan: stdout veya <dosya>.md)
  -i, --extract-images      UDF içindeki görselleri klasöre çıkar
  -j, --json                Çıktıyı ve meta verileri JSON formatında üretir (LLM / RAG uyumlu)
  -m, --metadata            Sadece belge meta verilerini (boyut, kelime sayısı, görsel adedi) gösterir
  -h, --help                Bu yardım mesajını göster
  -v, --version             Sürüm bilgisini göster

Örnekler:
  node cli.js dilekce.udf
  node cli.js dilekce.udf dilekce.md
  node cli.js dilekce.udf --json
  node cli.js karar.udf -o karar.md --extract-images
`);
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
    let extractImages = false;
    let jsonOutput = false;
    let metadataOnly = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-o" || arg === "--output") {
            outputFile = args[++i];
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
        console.error("Hata: Girdi dosyası belirtilmedi.");
        printHelp();
        process.exit(1);
    }

    const resolvedInput = path.resolve(process.cwd(), inputFile);
    if (!fs.existsSync(resolvedInput)) {
        console.error(`Hata: '${inputFile}' dosyası bulunamadı.`);
        process.exit(1);
    }

    const fileBuffer = fs.readFileSync(resolvedInput);
    const JSZip = require("./js/jszip.min.js");

    let xmlText = null;
    const images = [];

    // Check if it's a zip or plain xml
    try {
        const zip = await JSZip.loadAsync(fileBuffer);
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

        // Extract images
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".svg"];
        for (const [p, entry] of Object.entries(zip.files)) {
            const lower = p.toLowerCase();
            if (entry.dir) continue;
            if (imageExts.some(ext => lower.endsWith(ext))) {
                const base64 = await entry.async("base64");
                const ext = lower.split(".").pop();
                const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff", svg: "image/svg+xml" };
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
            // Try windows-1254
            try {
                const iconv = require("util").TextDecoder;
                xmlText = new iconv("windows-1254").decode(fileBuffer);
            } catch (err) {}
        }
    }

    if (!xmlText) {
        console.error("Hata: UDF içeriği çözülemedi.");
        process.exit(1);
    }

    // Convert XML to Markdown using built-in parser
    const markdown = convertXmlToMarkdown(xmlText, images);

    if (extractImages && images.length > 0) {
        const imgDir = path.resolve(
            path.dirname(outputFile ? path.resolve(process.cwd(), outputFile) : resolvedInput),
            path.basename(inputFile, path.extname(inputFile)) + "_images"
        );
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
        images.forEach(img => {
            const outPath = path.join(imgDir, img.name);
            fs.writeFileSync(outPath, Buffer.from(img.base64, "base64"));
        });
        console.error(`[Bilgi] ${images.length} adet görsel '${path.basename(imgDir)}/' klasörüne çıkarıldı.`);
    }

    const wordCount = (markdown.match(/\b\S+\b/g) || []).length;
    const charCount = markdown.length;

    const payload = {
        file_name: path.basename(inputFile),
        file_path: resolvedInput,
        file_size_bytes: fileBuffer.length,
        character_count: charCount,
        word_count: wordCount,
        images_count: images.length,
        converted_at: new Date().toISOString()
    };

    if (metadataOnly) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    if (jsonOutput) {
        payload.content_markdown = markdown;
        if (outputFile) {
            const resolvedOutput = path.resolve(process.cwd(), outputFile);
            fs.writeFileSync(resolvedOutput, JSON.stringify(payload, null, 2), "utf-8");
            console.error(`[Başarılı] JSON kaydedildi: ${outputFile}`);
        } else {
            process.stdout.write(JSON.stringify(payload, null, 2));
        }
        return;
    }

    if (outputFile) {
        const resolvedOutput = path.resolve(process.cwd(), outputFile);
        fs.writeFileSync(resolvedOutput, markdown, "utf-8");
        console.error(`[Başarılı] Markdown kaydedildi: ${outputFile}`);
    } else {
        process.stdout.write(markdown);
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
    images.forEach(img => {
        lines.push(`\n![${img.name}](data:${img.mimeType};base64,${img.base64})\n`);
    });

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

module.exports = { convertXmlToMarkdown };

if (require.main === module) {
    main().catch(err => {
        console.error("Hata:", err.message);
        process.exit(1);
    });
}
