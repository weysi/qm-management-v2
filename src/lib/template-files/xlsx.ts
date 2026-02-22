import JSZip from "jszip";

const PLACEHOLDER_REGEX = /\{\{([A-Z0-9_]+)\}\}/g;
const SHEET_XML_PATH_REGEX = /^xl\/worksheets\/sheet\d+\.xml$/i;
const SHARED_STRINGS_PATH = "xl/sharedStrings.xml";

const XML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, key: string) => {
    return XML_ENTITY_MAP[key] ?? _;
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractPlaceholdersFromText(text: string): string[] {
  const found = new Set<string>();
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    found.add(match[1]);
  }

  return Array.from(found);
}

function replacePlaceholdersInText(
  text: string,
  map: Record<string, string>,
  unresolved: Set<string>
): string {
  return text.replace(new RegExp(PLACEHOLDER_REGEX.source, "g"), (match, key: string) => {
    const value = map[key];
    if (value === undefined || value.trim() === "") {
      unresolved.add(key);
      return match;
    }
    return value;
  });
}

function getSheetPaths(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .filter((name) => SHEET_XML_PATH_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function extractSharedStringEntries(sharedStringsXml: string): string[] {
  return Array.from(sharedStringsXml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map(
    (match) => match[0]
  );
}

function plainTextFromSi(siXml: string): string {
  return Array.from(siXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function buildSharedStringsXml(entries: string[]): string {
  const count = entries.length;
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${count}" uniqueCount="${count}">`,
    entries.join(""),
    "</sst>",
  ].join("");
}

export async function extractPlaceholdersFromXlsx(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const placeholders = new Set<string>();

  const sharedStrings = zip.file(SHARED_STRINGS_PATH);
  if (sharedStrings) {
    const xml = await sharedStrings.async("string");
    const entries = extractSharedStringEntries(xml);
    for (const entry of entries) {
      for (const token of extractPlaceholdersFromText(plainTextFromSi(entry))) {
        placeholders.add(token);
      }
    }
  }

  const sheetPaths = getSheetPaths(zip);
  for (const path of sheetPaths) {
    const sheetFile = zip.file(path);
    if (!sheetFile) continue;
    const xml = await sheetFile.async("string");

    for (const tMatch of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      for (const token of extractPlaceholdersFromText(decodeXml(tMatch[1] ?? ""))) {
        placeholders.add(token);
      }
    }

    for (const vMatch of xml.matchAll(/<c\b[^>]*\bt="str"[^>]*>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g)) {
      for (const token of extractPlaceholdersFromText(decodeXml(vMatch[1] ?? ""))) {
        placeholders.add(token);
      }
    }
  }

  return Array.from(placeholders).sort((a, b) => a.localeCompare(b));
}

export async function applyPlaceholderMapToXlsx(
  buffer: Buffer,
  map: Record<string, string>
): Promise<{ output: Buffer; unresolved: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const unresolved = new Set<string>();

  const sharedStringsFile = zip.file(SHARED_STRINGS_PATH);
  const sharedStringsXml = sharedStringsFile
    ? await sharedStringsFile.async("string")
    : undefined;
  const sharedEntries = sharedStringsXml
    ? extractSharedStringEntries(sharedStringsXml)
    : [];
  const sharedTextByIndex = sharedEntries.map(plainTextFromSi);
  const sharedHasPlaceholder = sharedTextByIndex.map((text) =>
    new RegExp(PLACEHOLDER_REGEX.source, "g").test(text)
  );

  let didChange = false;
  const sheetPaths = getSheetPaths(zip);

  for (const path of sheetPaths) {
    const sheetFile = zip.file(path);
    if (!sheetFile) continue;

    const xml = await sheetFile.async("string");
    const updatedXml = xml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (cellXml, attrs, innerXml) => {
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch?.[1];

      if (type === "s") {
        const valueMatch = innerXml.match(/<v>(\d+)<\/v>/);
        if (!valueMatch) return cellXml;

        const sharedIndex = Number.parseInt(valueMatch[1], 10);
        if (!Number.isFinite(sharedIndex)) return cellXml;
        if (!sharedHasPlaceholder[sharedIndex]) return cellXml;

        const originalText = sharedTextByIndex[sharedIndex] ?? "";
        const replacedText = replacePlaceholdersInText(originalText, map, unresolved);
        const newEntry = `<si><t>${escapeXml(replacedText)}</t></si>`;
        sharedEntries.push(newEntry);
        const nextIndex = sharedEntries.length - 1;

        didChange = true;
        return `<c${attrs}>${innerXml.replace(/<v>\d+<\/v>/, `<v>${nextIndex}</v>`)}</c>`;
      }

      if (type === "inlineStr") {
        const textNodes = Array.from(
          innerXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)
        ) as RegExpMatchArray[];
        if (textNodes.length === 0) return cellXml;

        const originalText = textNodes.map((node) => decodeXml(node[1] ?? "")).join("");
        if (!new RegExp(PLACEHOLDER_REGEX.source, "g").test(originalText)) {
          return cellXml;
        }

        const replacedText = replacePlaceholdersInText(originalText, map, unresolved);
        let seen = false;
        const nextInner = innerXml.replace(
          /<t\b([^>]*)>([\s\S]*?)<\/t>/g,
          (_node: string, tAttrs: string) => {
            if (seen) {
              return `<t${tAttrs}></t>`;
            }
            seen = true;
            return `<t${tAttrs}>${escapeXml(replacedText)}</t>`;
          }
        );

        didChange = true;
        return `<c${attrs}>${nextInner}</c>`;
      }

      if (type === "str") {
        const valueMatch = innerXml.match(/<v>([\s\S]*?)<\/v>/);
        if (!valueMatch) return cellXml;
        const originalText = decodeXml(valueMatch[1] ?? "");
        if (!new RegExp(PLACEHOLDER_REGEX.source, "g").test(originalText)) {
          return cellXml;
        }

        const replacedText = replacePlaceholdersInText(originalText, map, unresolved);
        didChange = true;
        return `<c${attrs}>${innerXml.replace(
          /<v>[\s\S]*?<\/v>/,
          `<v>${escapeXml(replacedText)}</v>`
        )}</c>`;
      }

      return cellXml;
    });

    if (updatedXml !== xml) {
      zip.file(path, updatedXml);
    }
  }

  if (sharedStringsFile && didChange) {
    zip.file(SHARED_STRINGS_PATH, buildSharedStringsXml(sharedEntries));
  }

  if (!didChange) {
    return {
      output: buffer,
      unresolved: Array.from(unresolved).sort((a, b) => a.localeCompare(b)),
    };
  }

  const output = await zip.generateAsync({ type: "nodebuffer" });
  await JSZip.loadAsync(output);

  return {
    output,
    unresolved: Array.from(unresolved).sort((a, b) => a.localeCompare(b)),
  };
}
