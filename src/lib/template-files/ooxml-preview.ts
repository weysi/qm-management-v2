import { createHash } from "crypto";
import JSZip from "jszip";
import type {
  TemplateCanvasLayout,
  TemplateFileExt,
  TemplatePreviewBlock,
  TemplatePreviewBlockKind,
  TemplatePreviewGroup,
  TemplatePreviewResolvedSource,
  TemplatePreviewRun,
  TemplatePreviewSource,
} from "@/lib/schemas";
import { extractPlaceholders } from "@/lib/placeholders";

const DOCX_CONTENT_PATH_REGEX = /^word\/(document\.xml|header\d+\.xml|footer\d+\.xml)$/i;
const PPT_SLIDE_PATH_REGEX = /^ppt\/slides\/slide\d+\.xml$/i;

const DOCX_PARAGRAPH_REGEX = /<w:p\b[\s\S]*?<\/w:p>/g;
const DOCX_TABLE_CELL_REGEX = /<w:tc\b[\s\S]*?<\/w:tc>/g;
const DOCX_TEXT_NODE_REGEX = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
const DOCX_RUN_CONTAINER_REGEX = /<w:r\b[\s\S]*?<\/w:r>/g;

const PPT_PARAGRAPH_REGEX = /<a:p\b[\s\S]*?<\/a:p>/g;
const PPT_TEXT_NODE_REGEX = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
const PPT_RUN_CONTAINER_REGEX = /<a:r\b[\s\S]*?<\/a:r>/g;
const PPT_SHAPE_REGEX = /<p:sp\b[\s\S]*?<\/p:sp>/g;

const XML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const DOCX_PAGE_WIDTH = 816;
const DOCX_PAGE_HEIGHT = 1120;
const DOCX_MARGIN_X = 48;
const DOCX_MARGIN_Y = 48;
const DOCX_BLOCK_GAP = 10;
const DOCX_CONTENT_WIDTH = DOCX_PAGE_WIDTH - DOCX_MARGIN_X * 2;
const EMU_PER_PX = 9525;

interface Range {
  start: number;
  end: number;
}

interface ShapeLayoutRange extends Range {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  confidence: number;
}

interface TextNodeRun {
  xml: string;
  text: string;
  runIndex: number;
  charStart: number;
  charEnd: number;
  styleKey: string;
}

export interface OoxmlEditablePreview {
  groups: TemplatePreviewGroup[];
  blocks: TemplatePreviewBlock[];
  runs: TemplatePreviewRun[];
  layout: TemplateCanvasLayout[];
  previewVersion: string;
}

export class OoxmlIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OoxmlIntegrityError";
  }
}

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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseSlideNumber(path: string): number {
  const match = path.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function emuToPx(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value / EMU_PER_PX));
}

function hashText(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function textLength(value: string): number {
  return Array.from(value).length;
}

function buildRanges(xml: string, regex: RegExp): Range[] {
  const ranges: Range[] = [];
  const pattern = new RegExp(regex.source, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const start = match.index;
    const raw = match[0];
    ranges.push({ start, end: start + raw.length });
  }

  return ranges;
}

function isInsideRanges(index: number, ranges: Range[]): boolean {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) {
      return true;
    }
  }

  return false;
}

function getDocxXmlPaths(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .filter((name) => DOCX_CONTENT_PATH_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function getPptSlidePaths(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .filter((name) => PPT_SLIDE_PATH_REGEX.test(name))
    .sort((a, b) => parseSlideNumber(a) - parseSlideNumber(b));
}

function buildStyleKey(
  containerXml: string,
  textNodeOffset: number,
  runTag: "w:r" | "a:r",
  styleTag: "w:rPr" | "a:rPr",
  runIndex: number
): string {
  const runStart = containerXml.lastIndexOf(`<${runTag}`, textNodeOffset);
  const runEndTag = `</${runTag}>`;
  const runEnd = containerXml.indexOf(runEndTag, textNodeOffset);

  if (runStart === -1 || runEnd === -1) {
    return `${runTag}:${runIndex}`;
  }

  const runXml = containerXml.slice(runStart, runEnd + runEndTag.length);
  const styleRegex = new RegExp(`<${styleTag}\\b[\\s\\S]*?(?:\\/>|<\\/${styleTag}>)`);
  const styleMatch = runXml.match(styleRegex);

  if (!styleMatch) {
    return `${runTag}:${runIndex}`;
  }

  return hashText(styleMatch[0]);
}

function extractTextNodeRuns(
  containerXml: string,
  textNodeRegex: RegExp,
  runTag: "w:r" | "a:r",
  styleTag: "w:rPr" | "a:rPr"
): TextNodeRun[] {
  const runs: TextNodeRun[] = [];
  const pattern = new RegExp(textNodeRegex.source, "g");
  let match: RegExpExecArray | null;
  let cursor = 0;
  let runIndex = 0;

  while ((match = pattern.exec(containerXml)) !== null) {
    const decoded = decodeXml(match[1] ?? "");
    const start = cursor;
    const length = textLength(decoded);
    const end = start + length;

    runs.push({
      xml: match[0],
      text: decoded,
      runIndex,
      charStart: start,
      charEnd: end,
      styleKey: buildStyleKey(
        containerXml,
        match.index,
        runTag,
        styleTag,
        runIndex
      ),
    });

    cursor = end;
    runIndex += 1;
  }

  return runs;
}

function distributeTextAcrossRuns(text: string, runLengths: number[]): string[] {
  if (runLengths.length === 0) {
    return [];
  }

  if (runLengths.length === 1) {
    return [text];
  }

  const chars = Array.from(text);
  const totalChars = chars.length;
  const totalOriginal = runLengths.reduce((sum, value) => sum + value, 0);
  const targets = new Array<number>(runLengths.length).fill(0);

  if (totalOriginal === 0) {
    targets[0] = totalChars;
  } else {
    for (let i = 0; i < runLengths.length; i += 1) {
      targets[i] = Math.round((runLengths[i] / totalOriginal) * totalChars);
    }
  }

  let currentTotal = targets.reduce((sum, value) => sum + value, 0);
  let cursor = runLengths.length - 1;

  while (currentTotal < totalChars) {
    targets[cursor] += 1;
    currentTotal += 1;
    cursor = cursor > 0 ? cursor - 1 : runLengths.length - 1;
  }

  while (currentTotal > totalChars) {
    if (targets[cursor] > 0) {
      targets[cursor] -= 1;
      currentTotal -= 1;
    }
    cursor = cursor > 0 ? cursor - 1 : runLengths.length - 1;
  }

  const parts: string[] = [];
  let offset = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const take = targets[i];
    parts.push(chars.slice(offset, offset + take).join(""));
    offset += take;
  }

  if (offset < chars.length) {
    parts[parts.length - 1] += chars.slice(offset).join("");
  }

  return parts;
}

function replaceTextNodesInContainer(
  containerXml: string,
  textNodeRegex: RegExp,
  closingTag: "w:t" | "a:t",
  runContainerRegex: RegExp,
  newText: string
): {
  updatedContainer: string;
  textNodeCountBefore: number;
  textNodeCountAfter: number;
  runCountBefore: number;
  runCountAfter: number;
} {
  const textNodes = Array.from(containerXml.matchAll(new RegExp(textNodeRegex.source, "g")));
  const textNodeCountBefore = textNodes.length;
  const runCountBefore = Array.from(
    containerXml.matchAll(new RegExp(runContainerRegex.source, "g"))
  ).length;

  if (textNodeCountBefore === 0) {
    return {
      updatedContainer: containerXml,
      textNodeCountBefore,
      textNodeCountAfter: 0,
      runCountBefore,
      runCountAfter: runCountBefore,
    };
  }

  const runLengths = textNodes.map((node) => textLength(decodeXml(node[1] ?? "")));
  const redistributed = distributeTextAcrossRuns(newText, runLengths);
  const contentRegex = new RegExp(`>([\\s\\S]*?)<\\/${closingTag}>`);
  let seen = 0;

  const updatedContainer = containerXml.replace(
    new RegExp(textNodeRegex.source, "g"),
    (nodeXml) => {
      const replacement = escapeXml(redistributed[seen] ?? "");
      seen += 1;
      return nodeXml.replace(contentRegex, `>${replacement}</${closingTag}>`);
    }
  );

  const textNodeCountAfter = Array.from(
    updatedContainer.matchAll(new RegExp(textNodeRegex.source, "g"))
  ).length;
  const runCountAfter = Array.from(
    updatedContainer.matchAll(new RegExp(runContainerRegex.source, "g"))
  ).length;

  return {
    updatedContainer,
    textNodeCountBefore,
    textNodeCountAfter,
    runCountBefore,
    runCountAfter,
  };
}

function createBlock(args: {
  fileId: string;
  groupId: string;
  groupLabel: string;
  xmlPath: string;
  nodeIndex: number;
  kind: TemplatePreviewBlockKind;
  text: string;
  order: number;
}): TemplatePreviewBlock {
  return {
    id: buildBlockId(args.xmlPath, args.nodeIndex),
    fileId: args.fileId,
    groupId: args.groupId,
    groupLabel: args.groupLabel,
    xmlPath: args.xmlPath,
    nodeIndex: args.nodeIndex,
    kind: args.kind,
    text: args.text,
    placeholders: extractPlaceholders(args.text),
    order: args.order,
  };
}

function createDocxLayout(blocks: TemplatePreviewBlock[]): TemplateCanvasLayout[] {
  const ordered = blocks
    .filter((block) => block.kind !== "pptx_text_shape")
    .slice()
    .sort((a, b) => a.order - b.order);

  const layout: TemplateCanvasLayout[] = [];
  let page = 1;
  let cursorY = DOCX_MARGIN_Y;

  for (const block of ordered) {
    const estimatedLines = Math.max(1, Math.ceil(textLength(block.text) / 92));
    const height = Math.max(28, estimatedLines * 20 + 8);

    if (cursorY + height > DOCX_PAGE_HEIGHT - DOCX_MARGIN_Y) {
      page += 1;
      cursorY = DOCX_MARGIN_Y;
    }

    layout.push({
      blockId: block.id,
      pageOrSlide: page,
      x: DOCX_MARGIN_X,
      y: (page - 1) * DOCX_PAGE_HEIGHT + cursorY,
      w: DOCX_CONTENT_WIDTH,
      h: height,
      z: 2,
      confidence: 0.72,
    });

    cursorY += height + DOCX_BLOCK_GAP;
  }

  return layout;
}

function extractShapeGeometry(shapeXml: string): {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
} {
  const offMatch = shapeXml.match(
    /<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/>/
  );
  const extMatch = shapeXml.match(
    /<a:ext\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"[^>]*\/>/
  );

  if (!offMatch || !extMatch) {
    return {
      x: 40,
      y: 40,
      w: 640,
      h: 60,
      confidence: 0.42,
    };
  }

  return {
    x: emuToPx(Number(offMatch[1])),
    y: emuToPx(Number(offMatch[2])),
    w: Math.max(120, emuToPx(Number(extMatch[1]))),
    h: Math.max(26, emuToPx(Number(extMatch[2]))),
    confidence: 0.88,
  };
}

function collectShapeLayoutRanges(xml: string): ShapeLayoutRange[] {
  const ranges: ShapeLayoutRange[] = [];
  const pattern = new RegExp(PPT_SHAPE_REGEX.source, "g");
  let match: RegExpExecArray | null;
  let z = 1;

  while ((match = pattern.exec(xml)) !== null) {
    const shapeXml = match[0];
    if (!shapeXml.includes("<p:txBody")) {
      continue;
    }

    const geometry = extractShapeGeometry(shapeXml);
    const start = match.index;
    ranges.push({
      start,
      end: start + shapeXml.length,
      z,
      ...geometry,
    });
    z += 1;
  }

  return ranges;
}

function locateShapeLayout(
  paragraphStart: number,
  shapeRanges: ShapeLayoutRange[]
): ShapeLayoutRange | null {
  for (const shape of shapeRanges) {
    if (paragraphStart >= shape.start && paragraphStart < shape.end) {
      return shape;
    }
  }

  return null;
}

function validateEditedContainerInvariant(args: {
  blockId: string;
  textNodeCountBefore: number;
  textNodeCountAfter: number;
  runCountBefore: number;
  runCountAfter: number;
}) {
  if (args.textNodeCountBefore !== args.textNodeCountAfter) {
    throw new OoxmlIntegrityError(
      `Edited block ${args.blockId} changed text-node count (${args.textNodeCountBefore} -> ${args.textNodeCountAfter})`
    );
  }

  if (args.runCountBefore !== args.runCountAfter) {
    throw new OoxmlIntegrityError(
      `Edited block ${args.blockId} changed run count (${args.runCountBefore} -> ${args.runCountAfter})`
    );
  }
}

export function buildBlockId(xmlPath: string, nodeIndex: number): string {
  return `${xmlPath}#${nodeIndex}`;
}

export function buildPreviewVersion(buffer: Buffer, ext: TemplateFileExt): string {
  return createHash("sha256")
    .update(ext)
    .update(buffer)
    .digest("hex")
    .slice(0, 24);
}

export async function extractEditableBlocksFromOoxml(
  buffer: Buffer,
  ext: TemplateFileExt,
  fileId: string
): Promise<OoxmlEditablePreview> {
  const zip = await JSZip.loadAsync(buffer);
  const groups: TemplatePreviewGroup[] = [];
  const blocks: TemplatePreviewBlock[] = [];
  const runs: TemplatePreviewRun[] = [];
  const layout: TemplateCanvasLayout[] = [];
  let order = 0;

  if (ext === "docx") {
    const xmlPaths = getDocxXmlPaths(zip);

    for (let groupOrder = 0; groupOrder < xmlPaths.length; groupOrder += 1) {
      const xmlPath = xmlPaths[groupOrder];
      const xmlFile = zip.file(xmlPath);
      if (!xmlFile) continue;

      const groupId = `docx:${xmlPath}`;
      const groupLabel = `Dokument ${xmlPath.replace(/^word\//, "")}`;
      groups.push({ id: groupId, label: groupLabel, order: groupOrder });

      const xml = await xmlFile.async("string");
      const paragraphs = Array.from(xml.matchAll(new RegExp(DOCX_PARAGRAPH_REGEX.source, "g")));
      const tableCellRanges = buildRanges(xml, DOCX_TABLE_CELL_REGEX);

      for (let nodeIndex = 0; nodeIndex < paragraphs.length; nodeIndex += 1) {
        const paragraph = paragraphs[nodeIndex];
        const paragraphXml = paragraph[0];
        const paragraphStart = paragraph.index ?? 0;
        const blockId = buildBlockId(xmlPath, nodeIndex);
        const textRuns = extractTextNodeRuns(
          paragraphXml,
          DOCX_TEXT_NODE_REGEX,
          "w:r",
          "w:rPr"
        );
        const text = textRuns.map((run) => run.text).join("");
        if (text.trim() === "") continue;

        const kind: TemplatePreviewBlockKind = isInsideRanges(
          paragraphStart,
          tableCellRanges
        )
          ? "docx_table_cell"
          : "docx_paragraph";

        const block = createBlock({
          fileId,
          groupId,
          groupLabel,
          xmlPath,
          nodeIndex,
          kind,
          text,
          order: order++,
        });

        blocks.push(block);

        textRuns.forEach((run) => {
          runs.push({
            id: `${blockId}:run:${run.runIndex}`,
            blockId,
            xmlPath,
            nodeIndex,
            runIndex: run.runIndex,
            text: run.text,
            charStart: run.charStart,
            charEnd: run.charEnd,
            styleKey: run.styleKey,
          });
        });
      }
    }

    layout.push(...createDocxLayout(blocks));

    return {
      groups,
      blocks,
      runs,
      layout,
      previewVersion: buildPreviewVersion(buffer, ext),
    };
  }

  const slidePaths = getPptSlidePaths(zip);

  for (let groupOrder = 0; groupOrder < slidePaths.length; groupOrder += 1) {
    const xmlPath = slidePaths[groupOrder];
    const xmlFile = zip.file(xmlPath);
    if (!xmlFile) continue;

    const slideNumber = parseSlideNumber(xmlPath);
    const groupId = `slide:${slideNumber}`;
    const groupLabel = `Folie ${slideNumber}`;
    groups.push({ id: groupId, label: groupLabel, order: groupOrder });

    const xml = await xmlFile.async("string");
    const paragraphs = Array.from(xml.matchAll(new RegExp(PPT_PARAGRAPH_REGEX.source, "g")));
    const shapeRanges = collectShapeLayoutRanges(xml);
    const shapeLineCounters = new Map<number, number>();

    for (let nodeIndex = 0; nodeIndex < paragraphs.length; nodeIndex += 1) {
      const paragraph = paragraphs[nodeIndex];
      const paragraphXml = paragraph[0];
      const paragraphStart = paragraph.index ?? 0;
      const blockId = buildBlockId(xmlPath, nodeIndex);
      const textRuns = extractTextNodeRuns(
        paragraphXml,
        PPT_TEXT_NODE_REGEX,
        "a:r",
        "a:rPr"
      );
      const text = textRuns.map((run) => run.text).join("");
      if (text.trim() === "") continue;

      const block = createBlock({
        fileId,
        groupId,
        groupLabel,
        xmlPath,
        nodeIndex,
        kind: "pptx_text_shape",
        text,
        order: order++,
      });

      blocks.push(block);

      textRuns.forEach((run) => {
        runs.push({
          id: `${blockId}:run:${run.runIndex}`,
          blockId,
          xmlPath,
          nodeIndex,
          runIndex: run.runIndex,
          text: run.text,
          charStart: run.charStart,
          charEnd: run.charEnd,
          styleKey: run.styleKey,
        });
      });

      const shape = locateShapeLayout(paragraphStart, shapeRanges);
      if (shape) {
        const lineIndex = shapeLineCounters.get(shape.start) ?? 0;
        shapeLineCounters.set(shape.start, lineIndex + 1);
        const lineHeight = Math.max(22, Math.round(shape.h / 6));
        layout.push({
          blockId,
          pageOrSlide: slideNumber,
          x: shape.x,
          y: shape.y + lineIndex * lineHeight,
          w: shape.w,
          h: lineHeight,
          z: shape.z,
          confidence: shape.confidence,
        });
      } else {
        layout.push({
          blockId,
          pageOrSlide: slideNumber,
          x: 40,
          y: 40 + nodeIndex * 28,
          w: 640,
          h: 24,
          z: 1,
          confidence: 0.3,
        });
      }
    }
  }

  return {
    groups,
    blocks,
    runs,
    layout,
    previewVersion: buildPreviewVersion(buffer, ext),
  };
}

export async function applyBlockEditsToOoxml(
  buffer: Buffer,
  ext: TemplateFileExt,
  editsByBlockId: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  if (ext === "docx") {
    const xmlPaths = getDocxXmlPaths(zip);

    for (const xmlPath of xmlPaths) {
      const xmlFile = zip.file(xmlPath);
      if (!xmlFile) continue;

      let nodeIndex = 0;
      const xml = await xmlFile.async("string");
      const updated = xml.replace(new RegExp(DOCX_PARAGRAPH_REGEX.source, "g"), (paragraphXml) => {
        const blockId = buildBlockId(xmlPath, nodeIndex);
        nodeIndex += 1;

        const nextText = editsByBlockId[blockId];
        if (nextText === undefined) {
          return paragraphXml;
        }

        const rewritten = replaceTextNodesInContainer(
          paragraphXml,
          DOCX_TEXT_NODE_REGEX,
          "w:t",
          DOCX_RUN_CONTAINER_REGEX,
          nextText
        );

        validateEditedContainerInvariant({
          blockId,
          textNodeCountBefore: rewritten.textNodeCountBefore,
          textNodeCountAfter: rewritten.textNodeCountAfter,
          runCountBefore: rewritten.runCountBefore,
          runCountAfter: rewritten.runCountAfter,
        });

        return rewritten.updatedContainer;
      });

      zip.file(xmlPath, updated);
    }
  } else {
    const slidePaths = getPptSlidePaths(zip);

    for (const xmlPath of slidePaths) {
      const xmlFile = zip.file(xmlPath);
      if (!xmlFile) continue;

      let nodeIndex = 0;
      const xml = await xmlFile.async("string");
      const updated = xml.replace(new RegExp(PPT_PARAGRAPH_REGEX.source, "g"), (paragraphXml) => {
        const blockId = buildBlockId(xmlPath, nodeIndex);
        nodeIndex += 1;

        const nextText = editsByBlockId[blockId];
        if (nextText === undefined) {
          return paragraphXml;
        }

        const rewritten = replaceTextNodesInContainer(
          paragraphXml,
          PPT_TEXT_NODE_REGEX,
          "a:t",
          PPT_RUN_CONTAINER_REGEX,
          nextText
        );

        validateEditedContainerInvariant({
          blockId,
          textNodeCountBefore: rewritten.textNodeCountBefore,
          textNodeCountAfter: rewritten.textNodeCountAfter,
          runCountBefore: rewritten.runCountBefore,
          runCountAfter: rewritten.runCountAfter,
        });

        return rewritten.updatedContainer;
      });

      zip.file(xmlPath, updated);
    }
  }

  const output = await zip.generateAsync({ type: "nodebuffer" });
  await JSZip.loadAsync(output);
  return output;
}

export function resolveBlockPlaceholders(
  blocks: Pick<TemplatePreviewBlock, "placeholders">[],
  mergedMap: Record<string, string>
): string[] {
  const unresolved = new Set<string>();

  for (const block of blocks) {
    for (const token of block.placeholders) {
      const value = mergedMap[token];
      if (value === undefined || value.trim() === "") {
        unresolved.add(token);
      }
    }
  }

  return Array.from(unresolved).sort();
}

export function resolvePreviewSource(
  requested: TemplatePreviewSource,
  hasGenerated: boolean
): TemplatePreviewResolvedSource {
  if (requested === "generated") {
    return hasGenerated ? "generated" : "original";
  }

  if (requested === "original") {
    return "original";
  }

  return hasGenerated ? "generated" : "original";
}
