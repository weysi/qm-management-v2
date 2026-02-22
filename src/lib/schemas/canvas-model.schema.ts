import { z } from "zod";

// ─── Style schemas ───────────────────────────────────────────────────────────

export const RunStyleSchema = z.object({
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  fontSize: z.number().optional(), // half-points (w:sz)
  fontFamily: z.string().optional(),
  color: z.string().optional(), // hex without #
  highlight: z.string().optional(),
  verticalAlign: z.enum(["baseline", "superscript", "subscript"]).optional(),
  styleKey: z.string().optional(), // hash of original w:rPr XML — preserved for round-trip
});

export const ParagraphStyleSchema = z.object({
  styleId: z.string().optional(), // e.g. "Heading1", references styles.xml
  alignment: z
    .enum(["left", "center", "right", "justify", "distribute"])
    .optional(),
  spacingBefore: z.number().optional(), // twips
  spacingAfter: z.number().optional(), // twips
  indentLeft: z.number().optional(), // twips
  indentRight: z.number().optional(), // twips
  outlineLevel: z.number().int().optional(), // 0-8; used for section detection
  numId: z.number().int().optional(), // list numbering
  numLevel: z.number().int().optional(),
  keepWithNext: z.boolean().optional(),
  keepLines: z.boolean().optional(),
  pageBreakBefore: z.boolean().optional(),
});

// ─── Run schemas (inline content) ────────────────────────────────────────────

export const TextRunSchema = z.object({
  type: z.literal("text"),
  id: z.string(),
  text: z.string(),
  style: RunStyleSchema.optional(),
  placeholders: z.array(z.string()), // {{KEY}} tokens found in text
  localVersion: z.number().int().default(0), // optimistic locking
});

export const WrapModeSchema = z.enum([
  "inline",
  "square",
  "tight",
  "through",
  "topBottom",
  "behindText",
  "inFrontOfText",
]);

export const AnchorTypeSchema = z.enum([
  "page",
  "margin",
  "paragraph",
  "character",
]);

export const ImageRunSchema = z.object({
  type: z.literal("image"),
  id: z.string(),
  assetId: z.string(), // references ProjectAsset
  altText: z.string().optional(),
  widthEmu: z.number(),
  heightEmu: z.number(),
  anchorType: z.enum(["inline", "floating"]),
  wrapMode: WrapModeSchema.optional(),
  positionXEmu: z.number().optional(), // EMU from page edge if floating
  positionYEmu: z.number().optional(),
  positionXRef: z
    .enum(["page", "margin", "column", "character"])
    .optional(),
  positionYRef: z
    .enum(["page", "margin", "paragraph", "line"])
    .optional(),
  rotation: z.number().optional(), // degrees * 60000 (EMU angle unit)
  zIndex: z.number().int().optional(),
});

export const RunSchema = z.discriminatedUnion("type", [
  TextRunSchema,
  ImageRunSchema,
]);

// ─── Block schemas ────────────────────────────────────────────────────────────

export const ParagraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  id: z.string(),
  xmlPath: z.string(), // e.g. "word/document.xml" or "word/header1.xml"
  nodeIndex: z.number().int().nonnegative(), // position in parent XML for surgical patch
  style: ParagraphStyleSchema,
  runs: z.array(RunSchema),
  placeholders: z.array(z.string()),
  localVersion: z.number().int().default(0), // increments on every text change
});

export const TableCellSchema = z.object({
  id: z.string(),
  paragraphs: z.array(ParagraphBlockSchema),
  colSpan: z.number().int().optional(),
  rowSpan: z.number().int().optional(),
  rawCellPrXml: z.string().optional(), // verbatim <w:tcPr> XML preserved for round-trip
});

export const TableRowSchema = z.object({
  id: z.string(),
  cells: z.array(TableCellSchema),
  isHeader: z.boolean().optional(),
  height: z.number().optional(),
  rawRowPrXml: z.string().optional(),
});

export const TableBlockSchema = z.object({
  type: z.literal("table"),
  id: z.string(),
  xmlPath: z.string(),
  nodeIndex: z.number().int().nonnegative(),
  rows: z.array(TableRowSchema),
  rawTablePrXml: z.string(), // verbatim table properties — reinjected verbatim on export
});

export const BlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  TableBlockSchema,
]);

// ─── Floating document objects (logos, signatures, stamps, shapes) ────────────

export const PlacementZoneSchema = z.enum([
  "header-left",
  "header-center",
  "header-right",
  "footer-left",
  "footer-center",
  "footer-right",
  "body",
]);

export const PlacementRuleSchema = z.object({
  zone: PlacementZoneSchema.optional(),
  marginTopMm: z.number().optional(),
  marginRightMm: z.number().optional(),
  marginBottomMm: z.number().optional(),
  marginLeftMm: z.number().optional(),
  lockPosition: z.boolean().optional(), // prevents UI drag once rule is set
  applyToAllPages: z.boolean().optional(),
});

export const DocumentObjectSchema = z.object({
  id: z.string(),
  objectType: z.enum(["logo", "signature", "stamp", "image", "shape", "textbox"]),
  assetId: z.string().optional(),
  label: z.string().optional(),
  // Canvas position in pixels (UI); converted to EMU for export
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  // Page this object lives on
  pageNumber: z.number().int().positive(),
  // DOCX anchor semantics
  anchorType: AnchorTypeSchema,
  anchoredToParagraphId: z.string().optional(),
  wrapMode: WrapModeSchema,
  zIndex: z.number().int(),
  // Template placement rule (overrides drag position on export if lockPosition: true)
  placementRule: PlacementRuleSchema.optional(),
  // Verbatim original XML — used as base for patching position; not re-parsed
  rawDrawingXml: z.string().optional(),
  // Classification confidence (0–1); < 0.6 shows "?" badge in UI
  classificationConfidence: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Page ────────────────────────────────────────────────────────────────────

export const PageSchema = z.object({
  pageNumber: z.number().int().positive(),
  widthPx: z.number(),
  heightPx: z.number(),
  marginTopPx: z.number(),
  marginBottomPx: z.number(),
  marginLeftPx: z.number(),
  marginRightPx: z.number(),
  // Real-world dimensions for EMU conversion
  widthTwips: z.number().optional(),
  heightTwips: z.number().optional(),
  blocks: z.array(BlockSchema),
  objects: z.array(DocumentObjectSchema),
  xmlSourcePath: z.string(), // "word/document.xml", "word/header1.xml", etc.
});

// ─── Full Canvas Model ────────────────────────────────────────────────────────

export const CanvasModelSchema = z.object({
  version: z.string().default("1.0.0"), // schema version for migration
  projectId: z.string().uuid(),
  sourceFileId: z.string(),
  pages: z.array(PageSchema),
  documentObjects: z.array(DocumentObjectSchema), // floating objects that may span pages
  styles: z.record(z.string(), z.any()), // raw parsed styles from styles.xml
  metadata: z.object({
    pageCount: z.number().int(),
    hasHeaders: z.boolean(),
    hasFooters: z.boolean(),
    hasImages: z.boolean(),
    hasSignatures: z.boolean(),
    hasLogos: z.boolean(),
    extractedAt: z.string().datetime(),
    previewVersion: z.string(), // SHA256 of source DOCX — compatible with existing system
  }),
});

// ─── API request/response schemas ─────────────────────────────────────────────

export const SaveCanvasModelRequestSchema = z.object({
  canvasModel: CanvasModelSchema,
  createVersion: z.boolean().optional().default(false),
  versionLabel: z.string().optional(),
});

export const CanvasRewriteGuardrailsSchema = z.object({
  preserveStyles: z.boolean().default(true),
  preserveHeadersFooters: z.boolean().default(true),
  preserveTables: z.boolean().default(true),
  preservePlaceholders: z.boolean().default(true),
  preserveSignatures: z.boolean().default(true),
  maxTextLengthRatioChange: z.number().default(1.5),
});

export const CanvasRewriteRequestSchema = z.object({
  projectId: z.string().uuid(),
  scope: z.enum(["selection", "paragraph", "section", "document"]),
  selectedBlockIds: z.array(z.string()),
  blockLocalVersions: z.record(z.string(), z.number().int()),
  prompt: z.string().min(1),
  guardrails: CanvasRewriteGuardrailsSchema,
  clientId: z.string().optional(),
});

export const ExportDocxRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const ExportPdfRequestSchema = z.object({
  projectId: z.string().uuid(),
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type RunStyle = z.infer<typeof RunStyleSchema>;
export type ParagraphStyle = z.infer<typeof ParagraphStyleSchema>;
export type TextRun = z.infer<typeof TextRunSchema>;
export type ImageRun = z.infer<typeof ImageRunSchema>;
export type Run = z.infer<typeof RunSchema>;
export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>;
export type TableCell = z.infer<typeof TableCellSchema>;
export type TableRow = z.infer<typeof TableRowSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type DocumentObject = z.infer<typeof DocumentObjectSchema>;
export type PlacementRule = z.infer<typeof PlacementRuleSchema>;
export type PlacementZone = z.infer<typeof PlacementZoneSchema>;
export type WrapMode = z.infer<typeof WrapModeSchema>;
export type AnchorType = z.infer<typeof AnchorTypeSchema>;
export type Page = z.infer<typeof PageSchema>;
export type CanvasModel = z.infer<typeof CanvasModelSchema>;
export type CanvasRewriteGuardrails = z.infer<typeof CanvasRewriteGuardrailsSchema>;
