/**
 * DOCX → CanvasModel importer.
 * Extends the existing ooxml-preview.ts approach:
 * - Same JSZip parsing and nodeIndex addressing
 * - Adds full ParagraphStyleSchema, RunStyle, TableBlock, and DocumentObject support
 * - Extracts embedded images and classifies them as logo/signature/stamp/image
 */

import { createHash } from "crypto";
import JSZip from "jszip";
import { extractPlaceholders } from "@/lib/placeholders";
import type {
  CanvasModel,
  Block,
  ParagraphBlock,
  TableBlock,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  DocumentObject,
  Page,
} from "@/lib/schemas/canvas-model.schema";
import { parseStylesXml, resolveParagraphStyle, parseRunStyle } from "./style-resolver";
import {
  parseDrawingElement,
  classifyAsset,
  generateAssetId,
  detectMimeType,
  mapWrapType,
} from "./asset-extractor";
import {
  emuToPx,
  twipsToPx,
  A4_WIDTH_TWIPS,
  A4_HEIGHT_TWIPS,
} from "./image-position";

// ─── Constants (same as ooxml-preview.ts for compatibility) ──────────────────

const DOCX_PAGE_HEIGHT = 1120;
const DOCX_PAGE_WIDTH = 816;
const DOCX_MARGIN_X = 48;
const DOCX_MARGIN_Y = 48;
const DOCX_BLOCK_GAP = 10;
const DOCX_CONTENT_PATH_REGEX =
  /^word\/(document\.xml|header\d+\.xml|footer\d+\.xml)$/i;

// ─── XML helpers ──────────────────────────────────────────────────────────────

const XML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, key: string) =>
    XML_ENTITY_MAP[key] ?? _
  );
}

function generateId(prefix: string, ...parts: (string | number)[]): string {
  const hash = createHash("sha1")
    .update(parts.join(":"))
    .digest("hex")
    .slice(0, 10);
  return `${prefix}-${hash}`;
}

// ─── Relationship parser ──────────────────────────────────────────────────────

function parseRelationships(relsXml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const relRegex =
    /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*/g;
  let m: RegExpExecArray | null;
  while ((m = relRegex.exec(relsXml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

// ─── Page size parser ─────────────────────────────────────────────────────────

interface PageDimensions {
  widthPx: number;
  heightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  widthTwips: number;
  heightTwips: number;
}

function parsePageDimensions(docXml: string): PageDimensions {
  const pgSzMatch =
    /<w:pgSz\s+w:w="([^"]+)"\s+w:h="([^"]+)"/.exec(docXml) ??
    /<w:pgSz\s+w:h="([^"]+)"\s+w:w="([^"]+)"/.exec(docXml);

  const widthTwips = pgSzMatch ? parseInt(pgSzMatch[1], 10) : A4_WIDTH_TWIPS;
  const heightTwips = pgSzMatch ? parseInt(pgSzMatch[2], 10) : A4_HEIGHT_TWIPS;

  const pgMarMatch =
    /<w:pgMar\s+[^/]*w:top="([^"]+)"[^/]*w:right="([^"]+)"[^/]*w:bottom="([^"]+)"[^/]*w:left="([^"]+)"/.exec(
      docXml
    );

  const marginTopTwips = pgMarMatch ? parseInt(pgMarMatch[1], 10) : 1440;
  const marginRightTwips = pgMarMatch ? parseInt(pgMarMatch[2], 10) : 1440;
  const marginBottomTwips = pgMarMatch ? parseInt(pgMarMatch[3], 10) : 1440;
  const marginLeftTwips = pgMarMatch ? parseInt(pgMarMatch[4], 10) : 1440;

  // Scale page dimensions to match the DOCX_PAGE_WIDTH=816 coordinate system
  const scaleFactor = DOCX_PAGE_WIDTH / twipsToPx(widthTwips);

  return {
    widthPx: DOCX_PAGE_WIDTH,
    heightPx: Math.round(twipsToPx(heightTwips) * scaleFactor),
    marginTopPx: Math.round(twipsToPx(marginTopTwips) * scaleFactor),
    marginBottomPx: Math.round(twipsToPx(marginBottomTwips) * scaleFactor),
    marginLeftPx: Math.round(twipsToPx(marginLeftTwips) * scaleFactor),
    marginRightPx: Math.round(twipsToPx(marginRightTwips) * scaleFactor),
    widthTwips,
    heightTwips,
  };
}

// ─── Run builder ──────────────────────────────────────────────────────────────

function buildTextRun(
  runXml: string,
  blockId: string,
  runIndex: number
): TextRun | null {
  const textMatches = [...runXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
  if (textMatches.length === 0) return null;

  const text = textMatches.map((m) => decodeXml(m[1] ?? "")).join("");
  if (!text && !textMatches.length) return null;

  const rPrMatch = /<w:rPr\b[\s\S]*?(?:\/>|<\/w:rPr>)/.exec(runXml);
  const rPrXml = rPrMatch ? rPrMatch[0] : undefined;
  const styleKey = rPrXml
    ? createHash("sha1").update(rPrXml).digest("hex").slice(0, 12)
    : undefined;

  const style = rPrXml ? parseRunStyle(rPrXml) : {};
  if (styleKey) style.styleKey = styleKey;

  return {
    type: "text",
    id: generateId("run", blockId, String(runIndex)),
    text,
    style,
    placeholders: extractPlaceholders(text),
    localVersion: 0,
  };
}

// ─── Drawing / image run builder ──────────────────────────────────────────────

async function buildImageRun(
  drawingXml: string,
  blockId: string,
  runIndex: number,
  xmlPath: string,
  rels: Record<string, string>,
  zip: JSZip,
  assetRegistry: Map<string, { base64: string; mimeType: string; filename: string }>
): Promise<ImageRun | null> {
  const parsed = parseDrawingElement(drawingXml);
  if (!parsed.rId) return null;

  const relTarget = rels[parsed.rId];
  if (!relTarget) return null;

  // Resolve zip path (relationship targets are relative to the XML file's directory)
  const xmlDir = xmlPath.split("/").slice(0, -1).join("/");
  const cleanTarget = relTarget.replace(/^\.\//, "");
  const zipPath = cleanTarget.startsWith("word/")
    ? cleanTarget
    : `${xmlDir}/${cleanTarget}`.replace(/\/+/g, "/");

  const zipEntry = zip.files[zipPath];
  if (!zipEntry) return null;

  const rawBuffer = await zipEntry.async("base64");
  const filename = zipPath.split("/").pop() ?? "image.bin";
  const mimeType = detectMimeType(filename);
  const assetId = generateAssetId(zipPath, rawBuffer);

  if (!assetRegistry.has(assetId)) {
    assetRegistry.set(assetId, { base64: rawBuffer, mimeType, filename });
  }

  const wrapMode = mapWrapType(parsed.wrapType, parsed.isFloating);

  return {
    type: "image",
    id: generateId("imgrun", blockId, String(runIndex)),
    assetId,
    widthEmu: parsed.widthEmu,
    heightEmu: parsed.heightEmu,
    anchorType: parsed.isFloating ? "floating" : "inline",
    wrapMode,
    positionXEmu: parsed.isFloating ? parsed.posXEmu : undefined,
    positionYEmu: parsed.isFloating ? parsed.posYEmu : undefined,
  };
}

// ─── Paragraph builder ────────────────────────────────────────────────────────

async function buildParagraphBlock(
  paragraphXml: string,
  xmlPath: string,
  nodeIndex: number,
  styleMap: ReturnType<typeof parseStylesXml>,
  rels: Record<string, string>,
  zip: JSZip,
  assetRegistry: Map<string, { base64: string; mimeType: string; filename: string }>,
  floatingObjects: Array<{
    drawingXml: string;
    parsed: ReturnType<typeof parseDrawingElement>;
    blockId: string;
    nodeIndex: number;
    xmlPath: string;
  }>
): Promise<ParagraphBlock> {
  const blockId = generateId("para", xmlPath, String(nodeIndex));

  // Extract pPr (paragraph properties)
  const pPrMatch = /<w:pPr\b[\s\S]*?(?:\/>|<\/w:pPr>)/.exec(paragraphXml);
  const pPrXml = pPrMatch ? pPrMatch[0] : undefined;

  // Detect style ID from pPr
  const styleIdMatch = pPrXml
    ? /<w:pStyle\s+w:val="([^"]+)"/.exec(pPrXml)
    : null;
  const styleId = styleIdMatch ? styleIdMatch[1] : undefined;

  const style = resolveParagraphStyle(styleId, styleMap, pPrXml);

  // Extract runs
  const runs: Array<TextRun | ImageRun> = [];
  const runRegex = /<w:r\b[\s\S]*?<\/w:r>/g;
  const drawingRegex = /<w:drawing\b[\s\S]*?<\/w:drawing>/g;
  let runIndex = 0;
  let runMatch: RegExpExecArray | null;

  // Collect drawing positions to skip in run parsing
  const drawingPositions: Array<{ start: number; end: number }> = [];
  {
    const dr = new RegExp(drawingRegex.source, "g");
    let dm: RegExpExecArray | null;
    while ((dm = dr.exec(paragraphXml)) !== null) {
      drawingPositions.push({ start: dm.index, end: dm.index + dm[0].length });

      // Check if this drawing is a floating object (anchor)
      const parsed = parseDrawingElement(dm[0]);
      if (parsed.isFloating && parsed.rId) {
        floatingObjects.push({
          drawingXml: dm[0],
          parsed,
          blockId,
          nodeIndex,
          xmlPath,
        });
      } else if (!parsed.isFloating && parsed.rId) {
        // Inline image — add as ImageRun
        const imgRun = await buildImageRun(
          dm[0],
          blockId,
          runIndex,
          xmlPath,
          rels,
          zip,
          assetRegistry
        );
        if (imgRun) {
          runs.push(imgRun);
          runIndex++;
        }
      }
    }
  }

  // Extract text runs (excluding positions inside drawings)
  const runRegexG = new RegExp(runRegex.source, "g");
  while ((runMatch = runRegexG.exec(paragraphXml)) !== null) {
    const runStart = runMatch.index;
    const isInsideDrawing = drawingPositions.some(
      (d) => runStart >= d.start && runStart < d.end
    );
    if (isInsideDrawing) continue;

    const textRun = buildTextRun(runMatch[0], blockId, runIndex);
    if (textRun) {
      runs.push(textRun);
      runIndex++;
    }
  }

  const allText = runs
    .filter((r): r is TextRun => r.type === "text")
    .map((r) => r.text)
    .join("");

  return {
    type: "paragraph",
    id: blockId,
    xmlPath,
    nodeIndex,
    style,
    runs,
    placeholders: extractPlaceholders(allText),
    localVersion: 0,
  };
}

// ─── Table builder ────────────────────────────────────────────────────────────

async function buildTableBlock(
  tableXml: string,
  xmlPath: string,
  nodeIndex: number,
  styleMap: ReturnType<typeof parseStylesXml>,
  rels: Record<string, string>,
  zip: JSZip,
  assetRegistry: Map<string, { base64: string; mimeType: string; filename: string }>,
  floatingObjects: Array<{
    drawingXml: string;
    parsed: ReturnType<typeof parseDrawingElement>;
    blockId: string;
    nodeIndex: number;
    xmlPath: string;
  }>
): Promise<TableBlock> {
  const tableId = generateId("tbl", xmlPath, String(nodeIndex));

  // Extract rawTablePrXml
  const tblPrMatch = /<w:tblPr\b[\s\S]*?(?:\/>|<\/w:tblPr>)/.exec(tableXml);
  const rawTablePrXml = tblPrMatch ? tblPrMatch[0] : "<w:tblPr/>";

  const rows: TableRow[] = [];
  const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let rowMatch: RegExpExecArray | null;
  let rowIndex = 0;

  while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
    const rowXml = rowMatch[0];
    const rowId = generateId("row", tableId, String(rowIndex));

    const rowPrMatch = /<w:trPr\b[\s\S]*?(?:\/>|<\/w:trPr>)/.exec(rowXml);
    const isHeader = /<w:tblHeader\b/.test(rowPrMatch?.[0] ?? "");

    const cells: TableCell[] = [];
    const cellRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    let cellMatch: RegExpExecArray | null;
    let cellIndex = 0;

    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const cellXml = cellMatch[0];
      const cellId = generateId("cell", rowId, String(cellIndex));

      const tcPrMatch = /<w:tcPr\b[\s\S]*?(?:\/>|<\/w:tcPr>)/.exec(cellXml);

      const paragraphs: ParagraphBlock[] = [];
      const cellParaRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
      let cellParaMatch: RegExpExecArray | null;
      let cellParaIndex = 0;

      while ((cellParaMatch = cellParaRegex.exec(cellXml)) !== null) {
        const para = await buildParagraphBlock(
          cellParaMatch[0],
          xmlPath,
          nodeIndex * 10000 + rowIndex * 100 + cellIndex * 10 + cellParaIndex,
          styleMap,
          rels,
          zip,
          assetRegistry,
          floatingObjects
        );
        paragraphs.push(para);
        cellParaIndex++;
      }

      cells.push({
        id: cellId,
        paragraphs,
        rawCellPrXml: tcPrMatch ? tcPrMatch[0] : undefined,
      });
      cellIndex++;
    }

    rows.push({
      id: rowId,
      cells,
      isHeader,
      rawRowPrXml: rowPrMatch ? rowPrMatch[0] : undefined,
    });
    rowIndex++;
  }

  return {
    type: "table",
    id: tableId,
    xmlPath,
    nodeIndex,
    rows,
    rawTablePrXml,
  };
}

// ─── Layout algorithm (same as ooxml-preview.ts) ─────────────────────────────

interface LayoutResult {
  blockId: string;
  page: number;
  y: number;
  h: number;
}

function layoutBlocks(
  blocks: Block[],
  pageDims: PageDimensions
): LayoutResult[] {
  const results: LayoutResult[] = [];
  let currentY = DOCX_MARGIN_Y;
  let currentPage = 1;
  const effectivePageHeight = Math.max(pageDims.heightPx, DOCX_PAGE_HEIGHT);

  for (const block of blocks) {
    const h =
      block.type === "paragraph"
        ? estimateParagraphHeight(block)
        : estimateTableHeight(block);

    if (
      currentY + h > effectivePageHeight - DOCX_MARGIN_Y &&
      currentY > DOCX_MARGIN_Y
    ) {
      currentPage++;
      currentY = DOCX_MARGIN_Y;
    }

    const blockId =
      block.type === "paragraph" ? block.id : block.id;
    results.push({ blockId, page: currentPage, y: currentY, h });
    currentY += h + DOCX_BLOCK_GAP;
  }

  return results;
}

function estimateParagraphHeight(block: ParagraphBlock): number {
  const text = block.runs
    .filter((r): r is TextRun => r.type === "text")
    .map((r) => r.text)
    .join("");
  const charCount = text.length;
  const charsPerLine = Math.floor(
    (DOCX_PAGE_WIDTH - DOCX_MARGIN_X * 2) / 7.5
  );
  const lines = Math.max(1, Math.ceil(charCount / charsPerLine));
  const lineHeight = block.style.outlineLevel !== undefined && block.style.outlineLevel < 3 ? 24 : 18;
  return lines * lineHeight + 4;
}

function estimateTableHeight(block: TableBlock): number {
  return block.rows.length * 32 + 8;
}

// ─── Main import function ─────────────────────────────────────────────────────

export interface ImportDocxOptions {
  projectId: string;
  sourceFileId: string;
}

export interface ImportDocxResult {
  canvasModel: CanvasModel;
  assets: Array<{
    assetId: string;
    filename: string;
    mimeType: string;
    base64: string;
    objectType: DocumentObject["objectType"];
    confidence: number;
  }>;
}

export async function importDocxToCanvasModel(
  buffer: Buffer,
  options: ImportDocxOptions
): Promise<ImportDocxResult> {
  const zip = await JSZip.loadAsync(buffer);

  // ── Compute previewVersion (SHA256, same as existing system) ──────────────
  const previewVersion = createHash("sha256")
    .update(buffer)
    .digest("hex");

  // ── Parse styles.xml ─────────────────────────────────────────────────────
  const stylesEntry = zip.files["word/styles.xml"];
  const stylesXml = stylesEntry
    ? await stylesEntry.async("text")
    : "<w:styles/>";
  const styleMap = parseStylesXml(stylesXml);

  // ── Parse relationships ───────────────────────────────────────────────────
  const relsEntry = zip.files["word/_rels/document.xml.rels"];
  const relsXml = relsEntry ? await relsEntry.async("text") : "";
  const rels = parseRelationships(relsXml);

  // ── Parse page dimensions ────────────────────────────────────────────────
  const docEntry = zip.files["word/document.xml"];
  const docXml = docEntry ? await docEntry.async("text") : "";
  const pageDims = parsePageDimensions(docXml);

  // ── Asset registry (collected during parsing) ─────────────────────────────
  const assetRegistry = new Map<
    string,
    { base64: string; mimeType: string; filename: string }
  >();

  // ── Floating objects (collected during paragraph parsing) ─────────────────
  const floatingObjectsRaw: Array<{
    drawingXml: string;
    parsed: ReturnType<typeof parseDrawingElement>;
    blockId: string;
    nodeIndex: number;
    xmlPath: string;
  }> = [];

  // ── Process all DOCX content XML files ───────────────────────────────────
  const contentPaths = Object.values(zip.files)
    .filter((e) => !e.dir && DOCX_CONTENT_PATH_REGEX.test(e.name))
    .map((e) => e.name)
    .sort();

  const allBlocks: Block[] = [];
  let hasHeaders = false;
  let hasFooters = false;

  for (const xmlPath of contentPaths) {
    const isHeader = /header\d+\.xml/i.test(xmlPath);
    const isFooter = /footer\d+\.xml/i.test(xmlPath);
    if (isHeader) hasHeaders = true;
    if (isFooter) hasFooters = true;

    const xmlEntry = zip.files[xmlPath];
    if (!xmlEntry) continue;
    const xml = await xmlEntry.async("text");

    // Parse relationships for this specific XML file
    const xmlRelsPath = xmlPath.replace(/^word\//, "word/_rels/") + ".rels";
    const xmlRelsEntry = zip.files[xmlRelsPath];
    const xmlRels = xmlRelsEntry
      ? parseRelationships(await xmlRelsEntry.async("text"))
      : rels;

    // Walk top-level body children
    const bodyMatch = /<w:body\b[\s\S]*?<\/w:body>/.exec(xml);
    const bodyXml = bodyMatch ? bodyMatch[0] : xml;

    // Match top-level paragraphs and tables
    // We use a nodeIndex-based approach compatible with ooxml-preview.ts
    const topLevelRegex = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
    let tlMatch: RegExpExecArray | null;
    let nodeIndex = 0;

    while ((tlMatch = topLevelRegex.exec(bodyXml)) !== null) {
      const tag = tlMatch[1];
      const elementXml = tlMatch[0];

      if (tag === "p") {
        const block = await buildParagraphBlock(
          elementXml,
          xmlPath,
          nodeIndex,
          styleMap,
          xmlRels,
          zip,
          assetRegistry,
          floatingObjectsRaw
        );
        allBlocks.push(block);
      } else if (tag === "tbl") {
        const block = await buildTableBlock(
          elementXml,
          xmlPath,
          nodeIndex,
          styleMap,
          xmlRels,
          zip,
          assetRegistry,
          floatingObjectsRaw
        );
        allBlocks.push(block);
      }

      nodeIndex++;
    }
  }

  // ── Layout blocks across pages ────────────────────────────────────────────
  const layoutResults = layoutBlocks(allBlocks, pageDims);
  const layoutByBlockId = new Map(layoutResults.map((l) => [l.blockId, l]));

  // ── Determine page count ──────────────────────────────────────────────────
  const pageCount = layoutResults.reduce((max, l) => Math.max(max, l.page), 1);

  // ── Build DocumentObjects from floating images ─────────────────────────────
  const documentObjects: DocumentObject[] = [];
  const exportedAssets: ImportDocxResult["assets"] = [];

  for (const fo of floatingObjectsRaw) {
    if (!fo.parsed.rId) continue;

    const relTarget = rels[fo.parsed.rId];
    if (!relTarget) continue;

    const cleanTarget = relTarget.replace(/^\.\//, "");
    const xmlDir = fo.xmlPath.split("/").slice(0, -1).join("/");
    const zipPath = cleanTarget.startsWith("word/")
      ? cleanTarget
      : `${xmlDir}/${cleanTarget}`.replace(/\/+/g, "/");

    const zipEntry = zip.files[zipPath];
    if (!zipEntry) continue;

    const rawBuffer = await zipEntry.async("base64");
    const filename = zipPath.split("/").pop() ?? "image.bin";
    const mimeType = detectMimeType(filename);
    const assetId = generateAssetId(zipPath, rawBuffer);

    if (!assetRegistry.has(assetId)) {
      assetRegistry.set(assetId, { base64: rawBuffer, mimeType, filename });
    }

    const blockLayout = layoutByBlockId.get(fo.blockId);
    const blockYPx = blockLayout ? blockLayout.y : 0;
    const pageNumber = blockLayout ? blockLayout.page : 1;

    const { objectType, confidence } = classifyAsset(fo.parsed, {
      drawingXml: fo.drawingXml,
      xmlPath: fo.xmlPath,
      paragraphNodeIndex: fo.nodeIndex,
      blockYPx,
      pageHeightPx: pageDims.heightPx,
    });

    const wrapMode = mapWrapType(fo.parsed.wrapType, true);
    const widthPx = emuToPx(fo.parsed.widthEmu);
    const heightPx = emuToPx(fo.parsed.heightEmu);
    const xPx = emuToPx(fo.parsed.posXEmu);
    const yPx = emuToPx(fo.parsed.posYEmu);

    const now = new Date().toISOString();
    const docObj: DocumentObject = {
      id: generateId("obj", fo.xmlPath, String(fo.nodeIndex), assetId),
      objectType,
      assetId,
      label: `${objectType.charAt(0).toUpperCase() + objectType.slice(1)} ${documentObjects.length + 1}`,
      x: Math.max(0, xPx),
      y: Math.max(0, yPx),
      w: widthPx,
      h: heightPx,
      rotation: 0,
      pageNumber,
      anchorType: "page",
      wrapMode,
      zIndex: documentObjects.length,
      rawDrawingXml: fo.drawingXml,
      classificationConfidence: confidence,
      createdAt: now,
      updatedAt: now,
    };

    documentObjects.push(docObj);

    if (objectType !== "image") {
      exportedAssets.push({
        assetId,
        filename,
        mimeType,
        base64: rawBuffer,
        objectType,
        confidence,
      });
    }
  }

  // Also export all inline image assets
  for (const [assetId, asset] of assetRegistry.entries()) {
    if (!exportedAssets.find((a) => a.assetId === assetId)) {
      exportedAssets.push({
        assetId,
        filename: asset.filename,
        mimeType: asset.mimeType,
        base64: asset.base64,
        objectType: "image",
        confidence: 1,
      });
    }
  }

  // ── Assemble pages ────────────────────────────────────────────────────────
  const pages: Page[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const pageBlocks = allBlocks.filter((b) => {
      const l = layoutByBlockId.get(b.id);
      return l ? l.page === p : false;
    });
    const pageObjects = documentObjects.filter((o) => o.pageNumber === p);

    pages.push({
      pageNumber: p,
      widthPx: pageDims.widthPx,
      heightPx: pageDims.heightPx,
      marginTopPx: pageDims.marginTopPx,
      marginBottomPx: pageDims.marginBottomPx,
      marginLeftPx: pageDims.marginLeftPx,
      marginRightPx: pageDims.marginRightPx,
      widthTwips: pageDims.widthTwips,
      heightTwips: pageDims.heightTwips,
      blocks: pageBlocks,
      objects: pageObjects,
      xmlSourcePath: "word/document.xml",
    });
  }

  // ── Build CanvasModel ─────────────────────────────────────────────────────
  const hasImages = documentObjects.length > 0 || assetRegistry.size > 0;
  const hasSignatures = documentObjects.some((o) => o.objectType === "signature");
  const hasLogos = documentObjects.some((o) => o.objectType === "logo");

  const canvasModel: CanvasModel = {
    version: "1.0.0",
    projectId: options.projectId,
    sourceFileId: options.sourceFileId,
    pages,
    documentObjects,
    styles: styleMap,
    metadata: {
      pageCount,
      hasHeaders,
      hasFooters,
      hasImages,
      hasSignatures,
      hasLogos,
      extractedAt: new Date().toISOString(),
      previewVersion,
    },
  };

  return { canvasModel, assets: exportedAssets };
}
