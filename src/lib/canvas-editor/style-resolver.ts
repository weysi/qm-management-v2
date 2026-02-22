/**
 * Parse and resolve DOCX paragraph/run styles from styles.xml.
 * Handles the basedOn inheritance chain, flattening into resolved style objects.
 */

import type { ParagraphStyle, RunStyle } from "@/lib/schemas/canvas-model.schema";

// Raw style map keyed by styleId
type RawStyleMap = Record<string, Record<string, unknown>>;

/**
 * Parse styles.xml content into a flat map of styleId → raw style properties.
 * This is a simplified parser — only extracts properties relevant to our model.
 */
export function parseStylesXml(stylesXml: string): RawStyleMap {
  const result: RawStyleMap = {};

  // Extract each <w:style> element
  const styleRegex = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
  let m: RegExpExecArray | null;

  while ((m = styleRegex.exec(stylesXml)) !== null) {
    const attrs = m[1];
    const body = m[2];

    const typeMatch = /w:type="([^"]+)"/.exec(attrs);
    const idMatch = /w:styleId="([^"]+)"/.exec(attrs);
    if (!typeMatch || !idMatch) continue;

    const styleId = idMatch[1];

    // Extract basedOn
    const basedOnMatch = /<w:basedOn\s+w:val="([^"]+)"/.exec(body);
    const basedOn = basedOnMatch ? basedOnMatch[1] : null;

    // Extract name
    const nameMatch = /<w:name\s+w:val="([^"]+)"/.exec(body);
    const name = nameMatch ? nameMatch[1] : styleId;

    // Extract outlineLevel from pPr
    const outlineLevelMatch = /<w:outlineLvl\s+w:val="([^"]+)"/.exec(body);
    const outlineLevel = outlineLevelMatch
      ? parseInt(outlineLevelMatch[1], 10)
      : undefined;

    // Extract jc (alignment) from pPr
    const jcMatch = /<w:jc\s+w:val="([^"]+)"/.exec(body);
    const alignment = jcMatch ? jcMatch[1] : undefined;

    result[styleId] = {
      styleId,
      name,
      type: typeMatch[1],
      basedOn,
      outlineLevel,
      alignment,
    };
  }

  return result;
}

/**
 * Resolve a paragraph style by walking the basedOn chain.
 * Returns merged ParagraphStyle with inherited values filled in.
 */
export function resolveParagraphStyle(
  styleId: string | undefined,
  styleMap: RawStyleMap,
  inlinePpr?: string // raw <w:pPr> XML from the paragraph itself
): ParagraphStyle {
  const resolved: ParagraphStyle = {};

  // Walk the inheritance chain
  const visited = new Set<string>();
  let current = styleId;

  const chain: Record<string, unknown>[] = [];

  while (current && !visited.has(current)) {
    visited.add(current);
    const style = styleMap[current];
    if (style) {
      chain.push(style);
      current = style.basedOn as string | undefined;
    } else {
      break;
    }
  }

  // Apply chain from base to most-derived (later entries override earlier)
  for (const style of chain.reverse()) {
    if (style.outlineLevel !== undefined)
      resolved.outlineLevel = style.outlineLevel as number;
    if (style.alignment !== undefined)
      resolved.alignment = mapAlignment(style.alignment as string);
  }

  // Most-derived style
  if (styleId) {
    resolved.styleId = styleId;
  }

  // Override with inline pPr values
  if (inlinePpr) {
    const jc = /<w:jc\s+w:val="([^"]+)"/.exec(inlinePpr);
    if (jc) resolved.alignment = mapAlignment(jc[1]);

    const outlineLvl = /<w:outlineLvl\s+w:val="([^"]+)"/.exec(inlinePpr);
    if (outlineLvl) resolved.outlineLevel = parseInt(outlineLvl[1], 10);

    const spacingBefore = /<w:spacing\b[^>]*w:before="([^"]+)"/.exec(inlinePpr);
    if (spacingBefore) resolved.spacingBefore = parseInt(spacingBefore[1], 10);

    const spacingAfter = /<w:spacing\b[^>]*w:after="([^"]+)"/.exec(inlinePpr);
    if (spacingAfter) resolved.spacingAfter = parseInt(spacingAfter[1], 10);

    const indLeft = /<w:ind\b[^>]*w:left="([^"]+)"/.exec(inlinePpr);
    if (indLeft) resolved.indentLeft = parseInt(indLeft[1], 10);

    const indRight = /<w:ind\b[^>]*w:right="([^"]+)"/.exec(inlinePpr);
    if (indRight) resolved.indentRight = parseInt(indRight[1], 10);

    const numIdM = /<w:numId\s+w:val="([^"]+)"/.exec(inlinePpr);
    if (numIdM) resolved.numId = parseInt(numIdM[1], 10);

    const numLevelM = /<w:ilvl\s+w:val="([^"]+)"/.exec(inlinePpr);
    if (numLevelM) resolved.numLevel = parseInt(numLevelM[1], 10);

    if (/<w:keepNext\b/.test(inlinePpr)) resolved.keepWithNext = true;
    if (/<w:keepLines\b/.test(inlinePpr)) resolved.keepLines = true;
    if (/<w:pageBreakBefore\b/.test(inlinePpr)) resolved.pageBreakBefore = true;
  }

  return resolved;
}

/**
 * Parse run properties (<w:rPr> XML) into RunStyle.
 */
export function parseRunStyle(rprXml: string | undefined): RunStyle {
  if (!rprXml) return {};

  const style: RunStyle = {};

  if (/<w:b\b(?!\s*w:val="false")/.test(rprXml)) style.bold = true;
  if (/<w:i\b(?!\s*w:val="false")/.test(rprXml)) style.italic = true;
  if (/<w:u\b/.test(rprXml)) style.underline = true;
  if (/<w:strike\b/.test(rprXml)) style.strike = true;

  const szMatch = /<w:sz\s+w:val="([^"]+)"/.exec(rprXml);
  if (szMatch) style.fontSize = parseInt(szMatch[1], 10);

  const fontMatch = /<w:rFonts\s+w:ascii="([^"]+)"/.exec(rprXml);
  if (fontMatch) style.fontFamily = fontMatch[1];

  const colorMatch = /<w:color\s+w:val="([^"]+)"/.exec(rprXml);
  if (colorMatch && colorMatch[1] !== "auto") style.color = colorMatch[1];

  const highlightMatch = /<w:highlight\s+w:val="([^"]+)"/.exec(rprXml);
  if (highlightMatch) style.highlight = highlightMatch[1];

  const vertAlignMatch = /<w:vertAlign\s+w:val="([^"]+)"/.exec(rprXml);
  if (vertAlignMatch) {
    const va = vertAlignMatch[1];
    if (va === "superscript") style.verticalAlign = "superscript";
    else if (va === "subscript") style.verticalAlign = "subscript";
  }

  return style;
}

function mapAlignment(
  val: string
): ParagraphStyle["alignment"] {
  switch (val) {
    case "center":
      return "center";
    case "right":
      return "right";
    case "both":
    case "justify":
      return "justify";
    case "distribute":
      return "distribute";
    default:
      return "left";
  }
}
