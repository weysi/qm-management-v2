import { z } from "zod";

export const SaveLifecycleSchema = z.enum([
  "idle",
  "editing",
  "autosaving",
  "saved",
  "error",
]);

export const WorkflowStepStateSchema = z.enum([
  "locked",
  "available",
  "active",
  "completed",
  "invalidated",
]);

export const UploadMetadataSchema = z.object({
  sourceType: z.enum(["zip", "files"]),
  fileCount: z.number().int().nonnegative(),
  label: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});

export const AssetUploadSchema = z.object({
  assetType: z.enum(["logo", "signature"]),
  filename: z.string().min(1),
});

export const PlaceholderInputSchema = z.object({
  placeholderId: z.string().min(1),
  value: z.string().max(5000),
  isDate: z.boolean().default(false),
});

export const ExportReadinessSchema = z.object({
  fileId: z.string().min(1),
  filePath: z.string().min(1),
  requiredTotal: z.number().int().nonnegative(),
  requiredResolved: z.number().int().nonnegative(),
  missingRequiredCount: z.number().int().nonnegative(),
  completionPercentage: z.number().int().min(0).max(100),
  downloadState: z.enum(["ready", "blocked"]),
  missingPlaceholders: z.array(z.string()).default([]),
});

export type SaveLifecycle = z.infer<typeof SaveLifecycleSchema>;
export type WorkflowStepState = z.infer<typeof WorkflowStepStateSchema>;
export type UploadMetadata = z.infer<typeof UploadMetadataSchema>;
export type AssetUploadInput = z.infer<typeof AssetUploadSchema>;
export type PlaceholderInput = z.infer<typeof PlaceholderInputSchema>;
export type ExportReadiness = z.infer<typeof ExportReadinessSchema>;
