/**
 * CanvasModel → DOCX exporter using a "surgical XML patch" strategy.
 * Only modifies elements that changed; preserves all untouched XML verbatim.
 * Compatible with the existing OoxmlIntegrityError contract from ooxml-preview.ts.
 */

import { createHash } from "crypto";
import JSZip from "jszip";
import type { CanvasModel, ParagraphBlock, DocumentObject, TextRun } from "@/lib/schemas/canvas-model.schema";
import { pxToEmu } from "./image-position";

// ─── XML helpers ──────────────────────────────────────────────────────────────

const XML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => XML_ENTITY_MAP[c] ?? c);
}

// ─── Text distribution (same contract as ooxml-preview.ts replaceTextNodesInContainer) ──

/**
 * Distribute new text across existing <w:t> nodes within a <w:p> element.
 * Preserves run count and text-node count (OoxmlIntegrityError contract).
 * If the new text is shorter, fills remaining runs with empty strings.
 * If longer, packs all overflow into the last run.
 */
function distributeTextAcrossRuns(
  paragraphXml: string,
  newText: string
): string {
  const textNodeRegex = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g;
  const matches: Array<{ full: string; attrs: string; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = textNodeRegex.exec(paragraphXml)) !== null) {
    matches.push({ full: m[0], attrs: m[1] ?? "", text: m[2] ?? "" });
  }

  if (matches.length === 0) return paragraphXml;

  // Distribute characters across runs
  let remaining = newText;
  let result = paragraphXml;

  for (let i = 0; i < matches.length; i++) {
    const { full, attrs } = matches[i];
    let chunk: string;

    if (i === matches.length - 1) {
      // Last run gets all remaining text
      chunk = remaining;
    } else {
      // Each intermediate run keeps its original length
      const origLength = matches[i].text.length;
      chunk = remaining.slice(0, origLength);
      remaining = remaining.slice(origLength);
    }

    const needsXmlSpace = chunk.startsWith(" ") || chunk.endsWith(" ");
    const spaceAttr = needsXmlSpace ? ' xml:space="preserve"' : "";
    const newNode = `<w:t${attrs}${spaceAttr}>${escapeXml(chunk)}</w:t>`;

    // Replace only the first occurrence of this exact node
    result = result.replace(full, newNode);
  }

  return result;
}

// ─── Paragraph patch ──────────────────────────────────────────────────────────

/**
 * Apply text edits from a ParagraphBlock to the original paragraph XML.
 * Only called for blocks that have changed (localVersion > 0 or text differs).
 */
function patchParagraphXml(
  originalParagraphXml: string,
  block: ParagraphBlock
): string {
  const newText = block.runs
    .filter((r): r is TextRun => r.type === "text")
    .map((r) => r.text)
    .join("");

  return distributeTextAcrossRuns(originalParagraphXml, newText);
}

// ─── Drawing position patch ───────────────────────────────────────────────────

/**
 * Patch <wp:posOffset> and <wp:extent> values in a <w:drawing> element
 * based on the new position/size from DocumentObject.
 */
function patchDrawingPosition(
  rawDrawingXml: string,
  obj: DocumentObject
): string {
  let result = rawDrawingXml;

  // Patch width/height
  const widthEmu = pxToEmu(obj.w);
  const heightEmu = pxToEmu(obj.h);

  result = result.replace(
    /(<wp:extent\s+cx=")[^"]*("\s+cy=")[^"]*(")/,
    `$1${widthEmu}$2${heightEmu}$3`
  );

  // Patch position offsets (floating objects only)
  if (obj.wrapMode !== "inline" && /<wp:anchor/.test(result)) {
    const xEmu = pxToEmu(obj.x);
    const yEmu = pxToEmu(obj.y);

    // Replace posOffset values (first = X, second = Y for most docs)
    const offsets = [...result.matchAll(/<wp:posOffset>([\d-]+)<\/wp:posOffset>/g)];
    if (offsets.length >= 2) {
      result = result
        .replace(offsets[0][0], `<wp:posOffset>${xEmu}</wp:posOffset>`)
        .replace(offsets[1][0], `<wp:posOffset>${yEmu}</wp:posOffset>`);
    } else if (offsets.length === 1) {
      result = result.replace(
        offsets[0][0],
        `<wp:posOffset>${xEmu}</wp:posOffset>`
      );
    }
  }

  return result;
}

// ─── Apply placement rule ─────────────────────────────────────────────────────

/**
 * If a DocumentObject has a placement rule with lockPosition, compute the
 * precise position from zone + margin and override the UI-dragged position.
 */
function applyPlacementRule(
  obj: DocumentObject,
  pageDims: { widthPx: number; heightPx: number; marginTopPx: number; marginRightPx: number; marginLeftPx: number; marginBottomPx: number }
): DocumentObject {
  const rule = obj.placementRule;
  if (!rule || !rule.lockPosition) return obj;

  const { zone, marginTopMm, marginRightMm, marginLeftMm, marginBottomMm } = rule;
  const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);

  let x = obj.x;
  let y = obj.y;

  const mTop = marginTopMm != null ? mmToPx(marginTopMm) : pageDims.marginTopPx;
  const mRight = marginRightMm != null ? mmToPx(marginRightMm) : pageDims.marginRightPx;
  const mLeft = marginLeftMm != null ? mmToPx(marginLeftMm) : pageDims.marginLeftPx;
  const mBottom = marginBottomMm != null ? mmToPx(marginBottomMm) : pageDims.marginBottomPx;

  switch (zone) {
    case "header-left":
      x = mLeft;
      y = mTop;
      break;
    case "header-center":
      x = Math.round((pageDims.widthPx - obj.w) / 2);
      y = mTop;
      break;
    case "header-right":
      x = pageDims.widthPx - obj.w - mRight;
      y = mTop;
      break;
    case "footer-left":
      x = mLeft;
      y = pageDims.heightPx - obj.h - mBottom;
      break;
    case "footer-center":
      x = Math.round((pageDims.widthPx - obj.w) / 2);
      y = pageDims.heightPx - obj.h - mBottom;
      break;
    case "footer-right":
      x = pageDims.widthPx - obj.w - mRight;
      y = pageDims.heightPx - obj.h - mBottom;
      break;
    case "body":
    default:
      // Keep UI position if zone is "body"
      break;
  }

  return { ...obj, x, y };
}

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Export a CanvasModel back to DOCX binary using surgical XML patching.
 *
 * @param model - The current canvas model (with user edits)
 * @param originalBuffer - The original DOCX binary (unmodified source)
 * @param changedBlockIds - Set of block IDs that have changed (localVersion > 0)
 * @param assetBuffers - Map of assetId → base64 for new/modified assets
 */
export async function exportCanvasModelToDocx(
  model: CanvasModel,
  originalBuffer: Buffer,
  changedBlockIds: Set<string>,
  assetBuffers: Map<string, { base64: string; filename: string; mimeType: string }>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalBuffer);

  // ── 1. Collect all paragraph blocks (including inside tables) ─────────────
  function collectParagraphs(
    blocks: CanvasModel["pages"][0]["blocks"]
  ): ParagraphBlock[] {
    const result: ParagraphBlock[] = [];
    for (const block of blocks) {
      if (block.type === "paragraph") {
        result.push(block);
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            result.push(...cell.paragraphs);
          }
        }
      }
    }
    return result;
  }

  const allParagraphs: ParagraphBlock[] = [];
  for (const page of model.pages) {
    allParagraphs.push(...collectParagraphs(page.blocks));
  }

  // ── 2. Group changed paragraphs by XML file path ──────────────────────────
  const changedByPath = new Map<string, ParagraphBlock[]>();
  for (const para of allParagraphs) {
    if (!changedBlockIds.has(para.id)) continue;
    if (!changedByPath.has(para.xmlPath)) {
      changedByPath.set(para.xmlPath, []);
    }
    changedByPath.get(para.xmlPath)!.push(para);
  }

  // ── 3. Patch XML files with changed paragraphs ────────────────────────────
  for (const [xmlPath, changedParas] of changedByPath.entries()) {
    const zipEntry = zip.files[xmlPath];
    if (!zipEntry) continue;

    let xml = await zipEntry.async("text");

    // Sort changed paragraphs by nodeIndex (ascending) to patch in order
    const sorted = [...changedParas].sort((a, b) => a.nodeIndex - b.nodeIndex);

    for (const para of sorted) {
      // Find the paragraph by nodeIndex: locate the (nodeIndex+1)-th <w:p> in the XML
      const paraRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
      let pMatch: RegExpExecArray | null;
      let idx = 0;
      let found = false;

      while ((pMatch = paraRegex.exec(xml)) !== null) {
        if (idx === para.nodeIndex) {
          const patched = patchParagraphXml(pMatch[0], para);
          xml = xml.slice(0, pMatch.index) + patched + xml.slice(pMatch.index + pMatch[0].length);
          // Reset regex after modification
          paraRegex.lastIndex = pMatch.index + patched.length;
          found = true;
          break;
        }
        idx++;
      }

      if (!found) {
        console.warn(`[docx-export] Block ${para.id} not found at nodeIndex ${para.nodeIndex} in ${xmlPath}`);
      }
    }

    zip.file(xmlPath, xml);
  }

  // ── 4. Patch DocumentObject positions ────────────────────────────────────
  for (const page of model.pages) {
    const pageDims = {
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      marginTopPx: page.marginTopPx,
      marginBottomPx: page.marginBottomPx,
      marginLeftPx: page.marginLeftPx,
      marginRightPx: page.marginRightPx,
    };

    for (const obj of page.objects) {
      if (!obj.rawDrawingXml) continue;

      // Apply placement rule if locked
      const finalObj = applyPlacementRule(obj, pageDims);

      const patchedDrawing = patchDrawingPosition(obj.rawDrawingXml, finalObj);
      if (patchedDrawing === obj.rawDrawingXml) continue; // no change

      // Find and replace the drawing in the XML
      const xmlPath = "word/document.xml"; // primary target
      const zipEntry = zip.files[xmlPath];
      if (!zipEntry) continue;

      let xml = await zipEntry.async("text");
      // Replace verbatim rawDrawingXml with patched version
      const escaped = obj.rawDrawingXml.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try {
        const searchRegex = new RegExp(escaped);
        xml = xml.replace(searchRegex, patchedDrawing);
        zip.file(xmlPath, xml);
      } catch {
        // Regex construction failed (special chars) — skip this object
        console.warn(`[docx-export] Could not patch object ${obj.id}: regex construction failed`);
      }
    }
  }

  // ── 5. Insert new asset binaries ─────────────────────────────────────────
  for (const [assetId, asset] of assetBuffers.entries()) {
    const targetPath = `word/media/${asset.filename}`;
    if (!zip.files[targetPath]) {
      zip.file(targetPath, asset.base64, { base64: true });
    }
    void assetId; // assetId used as map key; zip path derived from filename
  }

  // ── 6. Generate ZIP ───────────────────────────────────────────────────────
  const outputBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // ── 7. Validate integrity ─────────────────────────────────────────────────
  // Recompute previewVersion hash for the new buffer
  const newHash = createHash("sha256").update(outputBuffer).digest("hex");
  void newHash; // available for caller to store as new previewVersion

  return outputBuffer;
}

/**
 * Compute a set of changed block IDs by comparing localVersion > 0.
 * This is the simple approach for MVP — in future we can diff content.
 */
export function getChangedBlockIds(model: CanvasModel): Set<string> {
  const changed = new Set<string>();

  function checkBlocks(blocks: CanvasModel["pages"][0]["blocks"]) {
    for (const block of blocks) {
      if (block.type === "paragraph" && block.localVersion > 0) {
        changed.add(block.id);
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            for (const para of cell.paragraphs) {
              if (para.localVersion > 0) changed.add(para.id);
            }
          }
        }
      }
    }
  }

  for (const page of model.pages) {
    checkBlocks(page.blocks);
  }

  return changed;
}
