import { z } from "zod";

export const TemplateFileExtSchema = z.enum(["docx", "pptx", "xlsx"]);

export const TemplateFileStatusSchema = z.enum([
  "uploaded",
  "generated",
  "error",
]);

export const TemplateFileSchema = z.object({
  id: z.string().uuid(),
  manualId: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  ext: TemplateFileExtSchema,
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  placeholders: z.array(z.string()),
  unresolvedPlaceholders: z.array(z.string()),
  status: TemplateFileStatusSchema,
  error: z.string().optional(),
  originalBase64: z.string(),
  generatedBase64: z.string().optional(),
  lastGeneratedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TemplateFileMetadataSchema = TemplateFileSchema.omit({
  originalBase64: true,
  generatedBase64: true,
}).extend({
  hasGeneratedVersion: z.boolean(),
});

export const GenerateTemplateFilesRequestSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1),
  globalOverrides: z.record(z.string(), z.string()).optional(),
  fileOverridesByFile: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export const DownloadTemplateFilesRequestSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1),
  generatedOnly: z.boolean().optional(),
});

export const TemplatePreviewGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  order: z.number().int().nonnegative(),
});

export const TemplatePreviewBlockKindSchema = z.enum([
  "docx_paragraph",
  "docx_table_cell",
  "pptx_text_shape",
]);

export const TemplatePreviewBlockSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  groupId: z.string(),
  groupLabel: z.string(),
  xmlPath: z.string(),
  nodeIndex: z.number().int().nonnegative(),
  kind: TemplatePreviewBlockKindSchema,
  text: z.string(),
  placeholders: z.array(z.string()),
  order: z.number().int().nonnegative(),
});

export const TemplatePreviewRunSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  xmlPath: z.string(),
  nodeIndex: z.number().int().nonnegative(),
  runIndex: z.number().int().nonnegative(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  styleKey: z.string(),
});

export const TemplateCanvasLayoutSchema = z.object({
  blockId: z.string(),
  pageOrSlide: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  z: z.number().int(),
  confidence: z.number().min(0).max(1),
});

export const TemplatePreviewSourceSchema = z.enum(["auto", "original", "generated"]);
export const TemplatePreviewResolvedSourceSchema = z.enum(["original", "generated"]);

export const TemplateFilePreviewSchema = z.object({
  file: TemplateFileMetadataSchema,
  source: TemplatePreviewResolvedSourceSchema,
  groups: z.array(TemplatePreviewGroupSchema),
  blocks: z.array(TemplatePreviewBlockSchema),
  runs: z.array(TemplatePreviewRunSchema),
  layout: z.array(TemplateCanvasLayoutSchema),
  previewVersion: z.string().min(1),
  unresolvedPlaceholders: z.array(z.string()),
});

export const GetTemplatePreviewQuerySchema = z.object({
  source: TemplatePreviewSourceSchema.optional().default("auto"),
});

export const SaveTemplatePreviewRequestSchema = z.object({
  source: TemplatePreviewSourceSchema.optional().default("auto"),
  previewVersion: z.string().min(1),
  edits: z
    .array(
      z.object({
        blockId: z.string().min(1),
        text: z.string(),
      })
    )
    .min(1),
  globalOverrides: z.record(z.string(), z.string()).optional(),
  fileOverrides: z.record(z.string(), z.string()).optional(),
});

export const RewriteTemplateFilesRequestSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1),
  prompt: z.string().min(1),
  mode: z.enum(["block", "full_file"]),
  blockIdsByFile: z.record(z.string(), z.array(z.string())).optional(),
  globalOverrides: z.record(z.string(), z.string()).optional(),
  fileOverridesByFile: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  preservePlaceholders: z.boolean().optional().default(true),
});

export type TemplateFileExt = z.infer<typeof TemplateFileExtSchema>;
export type TemplateFileStatus = z.infer<typeof TemplateFileStatusSchema>;
export type TemplateFile = z.infer<typeof TemplateFileSchema>;
export type TemplateFileMetadata = z.infer<typeof TemplateFileMetadataSchema>;
export type GenerateTemplateFilesRequest = z.infer<
  typeof GenerateTemplateFilesRequestSchema
>;
export type DownloadTemplateFilesRequest = z.infer<
  typeof DownloadTemplateFilesRequestSchema
>;
export type TemplatePreviewBlockKind = z.infer<typeof TemplatePreviewBlockKindSchema>;
export type TemplatePreviewGroup = z.infer<typeof TemplatePreviewGroupSchema>;
export type TemplatePreviewBlock = z.infer<typeof TemplatePreviewBlockSchema>;
export type TemplatePreviewRun = z.infer<typeof TemplatePreviewRunSchema>;
export type TemplateCanvasLayout = z.infer<typeof TemplateCanvasLayoutSchema>;
export type TemplatePreviewSource = z.infer<typeof TemplatePreviewSourceSchema>;
export type TemplatePreviewResolvedSource = z.infer<
  typeof TemplatePreviewResolvedSourceSchema
>;
export type TemplateFilePreview = z.infer<typeof TemplateFilePreviewSchema>;
export type GetTemplatePreviewQuery = z.infer<typeof GetTemplatePreviewQuerySchema>;
export type SaveTemplatePreviewRequest = z.infer<
  typeof SaveTemplatePreviewRequestSchema
>;
export type RewriteTemplateFilesRequest = z.infer<
  typeof RewriteTemplateFilesRequestSchema
>;
