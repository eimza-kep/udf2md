/**
 * UDF → Markdown Converter Engine
 * Converts UYAP Document Format (.udf) archives into clean Markdown.
 * 100% Client-Side — no data ever leaves the browser.
 */
window.Udf2Md = {

    /**
     * Main entry: takes a File/Blob/ArrayBuffer and returns { markdown, images[] }
     */
    async convert(inputData) {
        let arrayBuffer;
        if (inputData instanceof File || inputData instanceof Blob) {
            arrayBuffer = await inputData.arrayBuffer();
        } else if (inputData instanceof ArrayBuffer) {
            arrayBuffer = inputData;
        } else {
            throw new Error("Geçersiz dosya formatı.");
        }

        let xmlText = null;
        const images = []; // { name, base64, mimeType }

        // Step 1: Try opening as ZIP
        try {
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Find content.xml
            let contentFile = null;
            zip.forEach((relativePath, zipEntry) => {
                const lower = relativePath.toLowerCase();
                if (lower === "content.xml" || lower.endsWith("/content.xml")) {
                    contentFile = zipEntry;
                }
            });

            if (!contentFile) {
                zip.forEach((relativePath, zipEntry) => {
                    if (relativePath.toLowerCase().endsWith(".xml") && !contentFile) {
                        contentFile = zipEntry;
                    }
                });
            }

            if (contentFile) {
                xmlText = await contentFile.async("string");
            }

            // Extract images
            const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".svg"];
            for (const [path, entry] of Object.entries(zip.files)) {
                const lower = path.toLowerCase();
                if (entry.dir) continue;
                if (imageExts.some(ext => lower.endsWith(ext))) {
                    const base64 = await entry.async("base64");
                    const ext = lower.split(".").pop();
                    const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff", svg: "image/svg+xml" };
                    images.push({
                        name: path.split("/").pop(),
                        base64,
                        mimeType: mimeMap[ext] || "application/octet-stream"
                    });
                }
            }
        } catch (zipErr) {
            console.warn("ZIP olarak açılamadı, ham XML deneniyor:", zipErr);
        }

        // Step 2: Fallback to raw XML
        if (!xmlText) {
            const decoder = new TextDecoder("utf-8");
            const rawStr = decoder.decode(arrayBuffer);
            if (rawStr.includes("<template") || rawStr.includes("<elements") || rawStr.includes("<?xml")) {
                xmlText = rawStr;
            } else {
                try {
                    const trDecoder = new TextDecoder("windows-1254");
                    const trStr = trDecoder.decode(arrayBuffer);
                    if (trStr.includes("<template") || trStr.includes("<elements")) {
                        xmlText = trStr;
                    }
                } catch (e) {}
            }
        }

        if (!xmlText) {
            throw new Error("UDF belgesi çözülemedi. Dosya hasarlı veya desteklenmeyen biçimde.");
        }

        const markdown = this.xmlToMarkdown(xmlText, images);
        return { markdown, images };
    },

    /**
     * Converts content.xml to Markdown string
     */
    xmlToMarkdown(xmlText, images) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const parseError = xmlDoc.querySelector("parsererror");
        if (parseError) {
            throw new Error("XML çözümlenemedi: " + parseError.textContent);
        }

        let md = "";

        // Metadata header
        const template = xmlDoc.querySelector("template");
        if (template) {
            const formatId = template.getAttribute("format_id") || "?";
            md += `> **UYAP Doküman Formatı** — format v${formatId}\n\n`;
        }

        // Find elements
        const elements = xmlDoc.querySelector("elements");
        const nodes = elements ? elements.children : xmlDoc.querySelectorAll("paragraph");

        if (elements) {
            for (let i = 0; i < elements.children.length; i++) {
                const child = elements.children[i];
                const tag = child.nodeName.toLowerCase();
                if (tag === "paragraph") {
                    md += this.paragraphToMd(child) + "\n\n";
                } else if (tag === "table") {
                    md += this.tableToMd(child) + "\n\n";
                } else if (tag === "image" || tag === "picture") {
                    md += this.imageToMd(child, images) + "\n\n";
                }
            }
        } else {
            const paragraphs = xmlDoc.querySelectorAll("paragraph");
            paragraphs.forEach(p => {
                md += this.paragraphToMd(p) + "\n\n";
            });
        }

        // Append extracted images at bottom if any
        if (images.length > 0) {
            md += "\n---\n\n## Ekli Görseller\n\n";
            images.forEach((img, idx) => {
                md += `![${img.name}](data:${img.mimeType};base64,${img.base64})\n\n`;
            });
        }

        return md.replace(/\n{3,}/g, "\n\n").trim();
    },

    /**
     * Single <paragraph> → Markdown line
     */
    paragraphToMd(pNode) {
        const alignment = pNode.getAttribute("alignment");
        const contentNodes = pNode.querySelectorAll("content");
        let line = "";

        if (contentNodes.length > 0) {
            contentNodes.forEach(c => {
                let text = c.textContent || "";
                if (!text) return;

                const isBold = c.getAttribute("bold") === "true" || c.getAttribute("isBold") === "true";
                const isItalic = c.getAttribute("italic") === "true" || c.getAttribute("isItalic") === "true";
                const isUnderline = c.getAttribute("underline") === "true" || c.getAttribute("isUnderline") === "true";
                const fontSize = parseInt(c.getAttribute("fontSize") || "12", 10);

                // Detect headings: large font or bold+uppercase short texts
                // We'll handle heading detection at paragraph level below.

                if (isBold && isItalic) text = `***${text}***`;
                else if (isBold) text = `**${text}**`;
                else if (isItalic) text = `*${text}*`;

                if (isUnderline) text = `<u>${text}</u>`;

                line += text;
            });
        } else {
            line = pNode.textContent || "";
        }

        line = line.trim();
        if (!line) return "";

        // Heuristic heading detection
        const firstContent = pNode.querySelector("content");
        if (firstContent) {
            const fontSize = parseInt(firstContent.getAttribute("fontSize") || "12", 10);
            const isBold = firstContent.getAttribute("bold") === "true" || firstContent.getAttribute("isBold") === "true";
            const isCenter = alignment === "2" || alignment === "center";

            // If the whole paragraph is a short bold line with larger font → heading
            const plainText = pNode.textContent?.trim() || "";
            if (fontSize >= 18 && plainText.length < 120) {
                return `# ${this.stripMdFormatting(plainText)}`;
            }
            if (fontSize >= 14 && isBold && plainText.length < 120) {
                return `## ${this.stripMdFormatting(plainText)}`;
            }
            if (isBold && isCenter && plainText.length < 120) {
                return `## ${this.stripMdFormatting(plainText)}`;
            }
        }

        return line;
    },

    /**
     * <table> → Markdown table
     */
    tableToMd(tableNode) {
        const rows = tableNode.querySelectorAll("row");
        if (rows.length === 0) return "";

        let md = "";
        let headerDone = false;

        rows.forEach((row, rowIdx) => {
            const cells = row.querySelectorAll("cell");
            const cellTexts = [];

            cells.forEach(cell => {
                const paragraphs = cell.querySelectorAll("paragraph");
                let cellText = "";
                if (paragraphs.length > 0) {
                    const parts = [];
                    paragraphs.forEach(p => {
                        const t = (p.textContent || "").trim();
                        if (t) parts.push(t);
                    });
                    cellText = parts.join(" / ");
                } else {
                    cellText = (cell.textContent || "").trim();
                }
                // Escape pipes in cell text
                cellTexts.push(cellText.replace(/\|/g, "\\|"));
            });

            md += "| " + cellTexts.join(" | ") + " |\n";

            // Add header separator after first row
            if (!headerDone) {
                md += "| " + cellTexts.map(() => "---").join(" | ") + " |\n";
                headerDone = true;
            }
        });

        return md;
    },

    /**
     * <image> or <picture> element → inline Markdown image
     */
    imageToMd(node, images) {
        const src = node.getAttribute("src") || node.getAttribute("source") || "";
        const alt = node.getAttribute("alt") || node.getAttribute("description") || "Görsel";

        // Check if we extracted this image
        const matching = images.find(img => src.includes(img.name));
        if (matching) {
            return `![${alt}](data:${matching.mimeType};base64,${matching.base64})`;
        }
        return `![${alt}](${src})`;
    },

    stripMdFormatting(text) {
        return text.replace(/\*{1,3}/g, "").replace(/<\/?u>/g, "").trim();
    }
};
