import { z } from 'zod';
import {
  ApiValidationErrorSchema,
  DocumentSchema,
  DocumentVersionSchema,
  FileTreeNodeSchema,
  WorkspaceAssetSchema,
} from '@/lib/schemas';

const UploadSummarySchema = z.object({
  documents_created: z.number().int().nonnegative(),
  assets_bound: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
});

const UploadVariableSchema = z.object({
  id: z.string().uuid(),
  variable_name: z.string(),
  required: z.boolean(),
  source: z.enum(['user_input', 'system', 'ai_generated']),
  type: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const UploadWarningSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});

const UploadDocumentFileResponseSchema = z.object({
  kind: z.literal('file'),
  document: DocumentSchema,
  variables: z.array(UploadVariableSchema),
  summary: UploadSummarySchema,
});

const UploadDocumentZipResponseSchema = z.object({
  kind: z.literal('zip'),
  documents: z.array(DocumentSchema),
  assets: z.array(WorkspaceAssetSchema),
  warnings: z.array(UploadWarningSchema).default([]),
  summary: UploadSummarySchema,
});

export const UploadDocumentResponseSchema = z.union([
  UploadDocumentFileResponseSchema,
  UploadDocumentZipResponseSchema,
]);

export const UploadDocumentWarningSchema = UploadWarningSchema;
export const UploadDocumentSummarySchema = UploadSummarySchema;

export const UploadDocumentFileOnlyResponseSchema = UploadDocumentFileResponseSchema;
export const UploadDocumentZipOnlyResponseSchema = UploadDocumentZipResponseSchema;

export type UploadDocumentFileResponse = z.infer<typeof UploadDocumentFileResponseSchema>;
export type UploadDocumentZipResponse = z.infer<typeof UploadDocumentZipResponseSchema>;
export type UploadDocumentSummary = z.infer<typeof UploadSummarySchema>;
export type UploadDocumentWarning = z.infer<typeof UploadWarningSchema>;
export const UploadDocumentVariablesResponseSchema = z.object({
  variables: z.array(UploadVariableSchema),
});

export const ListDocumentsResponseSchema = z.object({
  documents: z.array(DocumentSchema),
});

export const RenderDocumentResponseSchema = z.object({
  version: DocumentVersionSchema,
  unresolved: z.array(
    z.object({
      variable: z.string(),
      raw_variable: z.string().optional(),
      start: z.number().nullable().optional(),
      end: z.number().nullable().optional(),
      xml_path: z.string().optional(),
    }),
  ),
  warnings: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const RewriteDocumentResponseSchema = z.object({
  version: DocumentVersionSchema,
});

export const TreeResponseSchema = z.object({
  tree: z.array(FileTreeNodeSchema),
});

export const DeletePathResponseSchema = z.object({
  deleted_count: z.number().int().nonnegative(),
  deleted_paths: z.array(z.string()),
});

export const ListAssetsResponseSchema = z.object({
  assets: z.array(WorkspaceAssetSchema),
});

export const UploadAssetResponseSchema = z.object({
  asset: WorkspaceAssetSchema,
});

export const AiFillVariableUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

export const AiFillVariableResponseSchema = z.object({
  value: z.string(),
  model: z.string(),
  usage: AiFillVariableUsageSchema,
});

export type UploadDocumentResponse = z.infer<typeof UploadDocumentResponseSchema>;
export type ListDocumentsResponse = z.infer<typeof ListDocumentsResponseSchema>;
export type RenderDocumentResponse = z.infer<typeof RenderDocumentResponseSchema>;
export type RewriteDocumentResponse = z.infer<typeof RewriteDocumentResponseSchema>;
export type TreeResponse = z.infer<typeof TreeResponseSchema>;
export type DeletePathResponse = z.infer<typeof DeletePathResponseSchema>;
export type ListAssetsResponse = z.infer<typeof ListAssetsResponseSchema>;
export type UploadAssetResponse = z.infer<typeof UploadAssetResponseSchema>;
export type AiFillVariableResponse = z.infer<typeof AiFillVariableResponseSchema>;
export type ApiValidationError = z.infer<typeof ApiValidationErrorSchema>;
