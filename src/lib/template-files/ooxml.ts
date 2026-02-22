import JSZip from "jszip";
import type { TemplateFileExt } from "@/lib/schemas";
import { applyBlockEditsToOoxml, extractEditableBlocksFromOoxml } from "./ooxml-preview";
import { applyPlaceholderMapToXlsx, extractPlaceholdersFromXlsx } from "./xlsx";

const PLACEHOLDER_REGEX = /\{\{([A-Z0-9_]+)\}\}/g;
const DOCX_CONTENT_PATH_REGEX = /^word\/(document\.xml|header\d+\.xml|footer\d+\.xml)$/i;
const PPT_SLIDE_PATH_REGEX = /^ppt\/slides\/slide\d+\.xml$/i;

function getXmlEntryPaths(zip: JSZip, ext: TemplateFileExt): string[] {
  if (ext === "xlsx") {
    return [];
  }

  const matcher = ext === "docx" ? DOCX_CONTENT_PATH_REGEX : PPT_SLIDE_PATH_REGEX;

  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .filter((name) => matcher.test(name));
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

export async function extractPlaceholdersFromOoxml(
  buffer: Buffer,
  ext: TemplateFileExt
): Promise<string[]> {
  if (ext === "xlsx") {
    return extractPlaceholdersFromXlsx(buffer);
  }

  const zip = await JSZip.loadAsync(buffer);
  const xmlPaths = getXmlEntryPaths(zip, ext);
  const placeholders = new Set<string>();

  for (const xmlPath of xmlPaths) {
    const xmlFile = zip.file(xmlPath);
    if (!xmlFile) continue;

    const xml = await xmlFile.async("string");
    for (const token of extractPlaceholdersFromText(xml)) {
      placeholders.add(token);
    }
  }

  return Array.from(placeholders).sort();
}

export async function applyPlaceholderMapToOoxml(
  buffer: Buffer,
  ext: TemplateFileExt,
  map: Record<string, string>
): Promise<{ output: Buffer; unresolved: string[] }> {
  if (ext === "xlsx") {
    return applyPlaceholderMapToXlsx(buffer, map);
  }

  const preview = await extractEditableBlocksFromOoxml(buffer, ext, "__placeholder__");
  const unresolved = new Set<string>();
  const editsByBlockId: Record<string, string> = {};

  for (const block of preview.blocks) {
    const replaced = replacePlaceholdersInText(block.text, map, unresolved);
    if (replaced !== block.text) {
      editsByBlockId[block.id] = replaced;
    }
  }

  if (Object.keys(editsByBlockId).length === 0) {
    return {
      output: buffer,
      unresolved: Array.from(unresolved).sort(),
    };
  }

  const output = await applyBlockEditsToOoxml(buffer, ext, editsByBlockId);
  return {
    output,
    unresolved: Array.from(unresolved).sort(),
  };
}
