import { z } from "zod";
import { TemplateFileExtSchema } from "./template-file.schema";

export const CompanyFunctionTypeSchema = z.enum([
  "service",
  "manufacturing",
  "software",
  "mixed",
]);

export const CompanyHeadcountRangeSchema = z.enum([
  "1-10",
  "11-50",
  "51-200",
  "200+",
]);

export const CompanyProfileSchema = z.object({
  id: z.string().min(1),
  legalName: z.string().min(1),
  industry: z.string().optional(),
  products: z.string().optional(),
  services: z.string().optional(),
  address: z.object({
    street: z.string().min(1),
    zip: z.string().min(1),
    city: z.string().min(1),
    country: z.string().min(1),
  }),
  contacts: z.object({
    ceo: z.string().min(1),
    qmManager: z.string().min(1),
  }),
  functionProfile: z.object({
    type: CompanyFunctionTypeSchema,
    regulated: z.boolean(),
    headcountRange: CompanyHeadcountRangeSchema,
  }),
});

export const PlaceholderValueTypeSchema = z.enum([
  "string",
  "date",
  "int",
  "enum",
  "richtext",
  "image",
]);

export const PlaceholderContextSchema = z.enum(["docx", "pptx", "xlsx"]);

export const PlaceholderRegistryEntrySchema = z.object({
  key: z.string().regex(/^[A-Z0-9_]+$/),
  type: PlaceholderValueTypeSchema.default("string"),
  global: z.boolean().default(false),
  description: z.string().optional(),
  contexts: z.array(PlaceholderContextSchema).default([]),
});

export const PlaceholderRegistrySchema = z.object({
  id: z.string().min(1),
  manualId: z.string().min(1),
  keys: z.array(PlaceholderRegistryEntrySchema),
  updatedAt: z.string().datetime(),
});

export const TemplateLibraryFileRoleSchema = z.enum([
  "manual_chapter",
  "process",
  "instruction",
  "form",
  "presentation",
  "spreadsheet",
  "unknown",
]);

export const TemplateLibraryFileSchema = z.object({
  id: z.string().min(1),
  sourceTemplateId: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  ext: TemplateFileExtSchema,
  role: TemplateLibraryFileRoleSchema.default("unknown"),
  variantTags: z.array(z.string()).default([]),
  placeholders: z.array(z.string()),
  references: z.array(z.string()).default([]),
  constraints: z.object({
    mustPreservePlaceholders: z.boolean().default(true),
  }),
});

export const TemplateLibraryManifestSchema = z.object({
  id: z.string().min(1),
  manualId: z.string().min(1),
  generatedAt: z.string().datetime(),
  folders: z.array(z.string()),
  files: z.array(TemplateLibraryFileSchema),
});

const ManualPlanApplyPlaceholdersOperationSchema = z.object({
  op: z.literal("applyPlaceholders"),
  mapId: z.string().min(1),
});

const ManualPlanInsertLogoOperationSchema = z.object({
  op: z.literal("insertLogo"),
  assetId: z.string().min(1),
  target: PlaceholderContextSchema,
  ruleId: z.string().min(1),
});

const ManualPlanInsertSignatureOperationSchema = z.object({
  op: z.literal("insertSignature"),
  assetId: z.string().min(1),
  target: PlaceholderContextSchema,
  ruleId: z.string().min(1),
});

const ManualPlanRewriteBlocksOperationSchema = z.object({
  op: z.literal("rewriteBlocks"),
  rewritePlanId: z.string().min(1),
});

export const ManualPlanOperationSchema = z.discriminatedUnion("op", [
  ManualPlanApplyPlaceholdersOperationSchema,
  ManualPlanInsertLogoOperationSchema,
  ManualPlanInsertSignatureOperationSchema,
  ManualPlanRewriteBlocksOperationSchema,
]);

export const ManualPlanTreeEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(["folder", "file"]),
  sourceTemplateId: z.string().min(1).optional(),
  operations: z.array(ManualPlanOperationSchema).optional(),
});

export const ManualPlanSchema = z.object({
  id: z.string().min(1),
  manualId: z.string().min(1),
  templateVariantId: z.string().min(1),
  createdAt: z.string().datetime(),
  outputTree: z.array(ManualPlanTreeEntrySchema),
});

export const ExecutionWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fileId: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const GenerationRunFileResultSchema = z.object({
  fileId: z.string().min(1),
  path: z.string().min(1),
  status: z.enum(["generated", "error", "skipped"]),
  unresolvedPlaceholders: z.array(z.string()),
  warnings: z.array(ExecutionWarningSchema),
  error: z.string().optional(),
});

export const GenerationRunReportSchema = z.object({
  id: z.string().min(1),
  manualId: z.string().min(1),
  createdAt: z.string().datetime(),
  status: z.enum(["success", "partial", "failed"]),
  planId: z.string().min(1).optional(),
  summary: z.object({
    totalFiles: z.number().int().nonnegative(),
    generatedFiles: z.number().int().nonnegative(),
    failedFiles: z.number().int().nonnegative(),
    skippedFiles: z.number().int().nonnegative(),
  }),
  files: z.array(GenerationRunFileResultSchema),
  warnings: z.array(ExecutionWarningSchema),
});

export const ScanManualGenerationRequestSchema = z.object({
  fileIds: z.array(z.string().min(1)).optional(),
});

export const PlanManualGenerationRequestSchema = z.object({
  selectedFileIds: z.array(z.string().min(1)).optional(),
  templateVariantId: z.string().min(1).optional(),
  globalOverrides: z.record(z.string(), z.string()).optional(),
  useAi: z.boolean().optional().default(true),
});

export const ExecuteManualGenerationRequestSchema = z.object({
  plan: ManualPlanSchema.optional(),
  placeholderMap: z.record(z.string(), z.string()).optional(),
  selectedFileIds: z.array(z.string().min(1)).optional(),
  globalOverrides: z.record(z.string(), z.string()).optional(),
  fileOverridesByFile: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  useAiFallback: z.boolean().optional().default(true),
});

export type CompanyFunctionType = z.infer<typeof CompanyFunctionTypeSchema>;
export type CompanyHeadcountRange = z.infer<typeof CompanyHeadcountRangeSchema>;
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
export type PlaceholderValueType = z.infer<typeof PlaceholderValueTypeSchema>;
export type PlaceholderContext = z.infer<typeof PlaceholderContextSchema>;
export type PlaceholderRegistryEntry = z.infer<typeof PlaceholderRegistryEntrySchema>;
export type PlaceholderRegistry = z.infer<typeof PlaceholderRegistrySchema>;
export type TemplateLibraryFileRole = z.infer<typeof TemplateLibraryFileRoleSchema>;
export type TemplateLibraryFile = z.infer<typeof TemplateLibraryFileSchema>;
export type TemplateLibraryManifest = z.infer<typeof TemplateLibraryManifestSchema>;
export type ManualPlanOperation = z.infer<typeof ManualPlanOperationSchema>;
export type ManualPlanTreeEntry = z.infer<typeof ManualPlanTreeEntrySchema>;
export type ManualPlan = z.infer<typeof ManualPlanSchema>;
export type ExecutionWarning = z.infer<typeof ExecutionWarningSchema>;
export type GenerationRunFileResult = z.infer<typeof GenerationRunFileResultSchema>;
export type GenerationRunReport = z.infer<typeof GenerationRunReportSchema>;
export type ScanManualGenerationRequest = z.infer<
  typeof ScanManualGenerationRequestSchema
>;
export type PlanManualGenerationRequest = z.infer<
  typeof PlanManualGenerationRequestSchema
>;
export type ExecuteManualGenerationRequest = z.infer<
  typeof ExecuteManualGenerationRequestSchema
>;
