/**
 * Utilities for converting between pixel coordinates (UI) and EMU (DOCX internal unit).
 * 1 inch = 914400 EMU; at 96 DPI, 1 px = 9525 EMU.
 */

export const EMU_PER_PX = 9525; // 96 DPI
export const TWIPS_PER_INCH = 1440;
export const EMU_PER_INCH = 914400;
export const PX_PER_INCH = 96;

/** Convert pixels to EMU */
export function pxToEmu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

/** Convert EMU to pixels */
export function emuToPx(emu: number): number {
  return Math.round(emu / EMU_PER_PX);
}

/** Convert twips to pixels (for page dimensions from w:pgSz) */
export function twipsToPx(twips: number): number {
  return Math.round((twips / TWIPS_PER_INCH) * PX_PER_INCH);
}

/** Convert pixels to twips */
export function pxToTwips(px: number): number {
  return Math.round((px / PX_PER_INCH) * TWIPS_PER_INCH);
}

/** Convert millimeters to EMU */
export function mmToEmu(mm: number): number {
  return Math.round((mm / 25.4) * EMU_PER_INCH);
}

/** Convert EMU to millimeters */
export function emuToMm(emu: number): number {
  return Math.round((emu / EMU_PER_INCH) * 25.4 * 10) / 10;
}

/** Convert millimeters to pixels */
export function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * PX_PER_INCH);
}

/**
 * Convert a px-based UI position to EMU, relative to page size.
 * Used for floating objects: takes the px offset from the page origin
 * and returns EMU suitable for <wp:posOffset>.
 */
export function uiPosToPosOffset(
  pxOffset: number,
  _pageSizePx: number,
  _pageSizeEmu: number
): number {
  // Simple direct conversion — EMU_PER_PX is constant regardless of page size
  return pxToEmu(pxOffset);
}

/**
 * Parse a <wp:posOffset> value (EMU string) into px.
 */
export function posOffsetToPx(emuStr: string): number {
  return emuToPx(parseInt(emuStr, 10) || 0);
}

/**
 * Parse <wp:extent cx="..." cy="..."> attributes into px dimensions.
 */
export function extentToPx(emuStr: string): number {
  return emuToPx(parseInt(emuStr, 10) || 0);
}

/**
 * Standard A4 page dimensions in twips (used as fallback when w:pgSz is absent).
 * A4 = 210mm × 297mm
 */
export const A4_WIDTH_TWIPS = 11906;
export const A4_HEIGHT_TWIPS = 16838;
