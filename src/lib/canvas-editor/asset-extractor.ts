/**
 * Extracts embedded images from DOCX ZIP and classifies them as logo/signature/stamp/image.
 * Classification uses heuristic signals: position, size, aspect ratio, source XML path.
 */

import { createHash } from "crypto";
import { emuToPx, emuToMm } from "./image-position";
import type { DocumentObject } from "@/lib/schemas/canvas-model.schema";

export interface DrawingContext {
  /** Raw <w:drawing> XML fragment */
  drawingXml: string;
  /** Source XML file path (e.g. "word/header1.xml") */
  xmlPath: string;
  /** Position of the paragraph this drawing is in (0-indexed nodeIndex) */
  paragraphNodeIndex: number;
  /** Y position of parent block in px (for body placement detection) */
  blockYPx: number;
  /** Page height in px (for "near bottom" detection) */
  pageHeightPx: number;
  /** Surrounding text content (for keyword detection) */
  surroundingText?: string;
}

export interface ExtractedAsset {
  /** Unique ID for this asset */
  assetId: string;
  /** Relationship target path inside ZIP (e.g. "word/media/image1.png") */
  zipPath: string;
  /** Filename for storage */
  filename: string;
  mimeType: string;
  /** Base64-encoded binary */
  base64: string;
}

export interface ClassifiedObject {
  assetId: string;
  objectType: DocumentObject["objectType"];
  confidence: number;
  heuristicReasons: string[];
  widthPx: number;
  heightPx: number;
  positionXPx: number;
  positionYPx: number;
  anchorType: "inline" | "floating";
  rawDrawingXml: string;
}

/**
 * Parse a <w:drawing> element to extract image relationship ID, position, and size.
 */
export function parseDrawingElement(drawingXml: string): {
  rId: string | null;
  widthEmu: number;
  heightEmu: number;
  isFloating: boolean;
  posXEmu: number;
  posYEmu: number;
  wrapType: string | null;
} {
  // Relationship ID
  const rIdMatch = /<a:blip\s+r:embed="([^"]+)"/.exec(drawingXml);
  const rId = rIdMatch ? rIdMatch[1] : null;

  // Size from <wp:extent cx="..." cy="...">
  const extentMatch = /<wp:extent\s+cx="([^"]+)"\s+cy="([^"]+)"/.exec(drawingXml);
  const widthEmu = extentMatch ? parseInt(extentMatch[1], 10) : 0;
  const heightEmu = extentMatch ? parseInt(extentMatch[2], 10) : 0;

  // Check if floating (wp:anchor) vs inline (wp:inline)
  const isFloating = /<wp:anchor\b/.test(drawingXml);

  // Position for floating objects
  const posXMatch = /<wp:posOffset>([\d-]+)<\/wp:posOffset>/.exec(drawingXml);
  const posYMatch = drawingXml.match(/<wp:posOffset>([\d-]+)<\/wp:posOffset>/g);
  const posXEmu = posXMatch ? parseInt(posXMatch[1], 10) : 0;
  const posYEmu =
    posYMatch && posYMatch.length > 1
      ? parseInt(posYMatch[1].replace(/<\/?wp:posOffset>/g, ""), 10)
      : 0;

  // Wrap type
  const wrapMatch = /<wp:(wrapNone|wrapSquare|wrapTight|wrapThrough|wrapTopAndBottom|wrapBehindText|wrapInFrontOfText)\b/.exec(
    drawingXml
  );
  const wrapType = wrapMatch ? wrapMatch[1] : null;

  return { rId, widthEmu, heightEmu, isFloating, posXEmu, posYEmu, wrapType };
}

/**
 * Classify an extracted image as logo, signature, stamp, or generic image.
 */
export function classifyAsset(
  parsed: ReturnType<typeof parseDrawingElement>,
  context: DrawingContext
): { objectType: DocumentObject["objectType"]; confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let logoScore = 0;
  let sigScore = 0;
  let stampScore = 0;

  const widthPx = emuToPx(parsed.widthEmu);
  const heightPx = emuToPx(parsed.heightEmu);
  const widthMm = emuToMm(parsed.widthEmu);
  const heightMm = emuToMm(parsed.heightEmu);
  const aspectRatio = heightPx > 0 ? widthPx / heightPx : 1;

  // ── Logo signals ──────────────────────────────────────────────────────
  if (/header\d*\.xml/i.test(context.xmlPath)) {
    logoScore += 3;
    reasons.push("in header XML");
  }
  if (widthMm > 20 && widthMm < 150 && heightMm < 60) {
    logoScore += 1;
    reasons.push(`landscape dimensions (${widthMm.toFixed(0)}×${heightMm.toFixed(0)}mm)`);
  }
  if (aspectRatio > 1.5) {
    logoScore += 1;
    reasons.push(`wide aspect ratio (${aspectRatio.toFixed(1)}:1)`);
  }

  // ── Signature signals ─────────────────────────────────────────────────
  if (/document\.xml/i.test(context.xmlPath)) {
    const relativeY =
      context.pageHeightPx > 0
        ? context.blockYPx / context.pageHeightPx
        : 0.5;
    if (relativeY > 0.6) {
      sigScore += 2;
      reasons.push("positioned in lower half of page");
    }
  }
  if (aspectRatio >= 2 && aspectRatio <= 5 && widthMm >= 40 && widthMm <= 100) {
    sigScore += 2;
    reasons.push(`signature-like aspect ratio (${aspectRatio.toFixed(1)}:1)`);
  }
  const sigKeywords = /unterschrift|signature|signed|signed by|gezeichnet|datum/i;
  if (context.surroundingText && sigKeywords.test(context.surroundingText)) {
    sigScore += 3;
    reasons.push("signature-related text nearby");
  }

  // ── Stamp signals ─────────────────────────────────────────────────────
  if (aspectRatio > 0.8 && aspectRatio < 1.2) {
    stampScore += 2;
    reasons.push(`near-square (${aspectRatio.toFixed(2)}:1)`);
  }
  if (widthMm >= 25 && widthMm <= 80 && heightMm >= 25 && heightMm <= 80) {
    stampScore += 1;
    reasons.push("stamp-like size");
  }
  if (/stempel|stamp|seal/i.test(context.surroundingText ?? "")) {
    stampScore += 3;
    reasons.push("stamp-related text nearby");
  }

  // ── Decision ──────────────────────────────────────────────────────────
  const maxScore = Math.max(logoScore, sigScore, stampScore);

  if (maxScore === 0) {
    return { objectType: "image", confidence: 1, reasons: ["no specific signals"] };
  }

  if (logoScore >= sigScore && logoScore >= stampScore) {
    const confidence = Math.min(logoScore / 6, 1);
    return { objectType: "logo", confidence, reasons };
  }
  if (sigScore >= stampScore) {
    const confidence = Math.min(sigScore / 7, 1);
    return { objectType: "signature", confidence, reasons };
  }
  const confidence = Math.min(stampScore / 6, 1);
  return { objectType: "stamp", confidence, reasons };
}

/**
 * Generate a deterministic assetId from the ZIP path and content hash.
 */
export function generateAssetId(zipPath: string, contentBase64: string): string {
  const hash = createHash("sha256")
    .update(zipPath)
    .update(contentBase64.slice(0, 200))
    .digest("hex")
    .slice(0, 16);
  return `asset-${hash}`;
}

/**
 * Detect MIME type from filename extension.
 */
export function detectMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    emf: "image/emf",
    wmf: "image/wmf",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

/**
 * Map DOCX wrap type string to our WrapMode enum value.
 */
export function mapWrapType(
  wrapType: string | null,
  isFloating: boolean
): import("@/lib/schemas/canvas-model.schema").WrapMode {
  if (!isFloating) return "inline";
  switch (wrapType) {
    case "wrapNone":
      return "inFrontOfText";
    case "wrapSquare":
      return "square";
    case "wrapTight":
      return "tight";
    case "wrapThrough":
      return "through";
    case "wrapTopAndBottom":
      return "topBottom";
    case "wrapBehindText":
      return "behindText";
    case "wrapInFrontOfText":
      return "inFrontOfText";
    default:
      return "square";
  }
}
