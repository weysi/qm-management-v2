import { z } from 'zod';
import {
  ApiValidationErrorSchema,
  DocumentSchema,
  DocumentVersionSchema,
  FileTreeNodeSchema,
  WorkspaceAssetSchema,
} from '@/lib/schemas';

export const UploadDocumentResponseSchema = z.object({
  document: DocumentSchema,
  variables: z.array(
    z.object({
      id: z.string().uuid(),
      variable_name: z.string(),
      required: z.boolean(),
      source: z.enum(['user_input', 'system', 'ai_generated']),
      type: z.string(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
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

export type UploadDocumentResponse = z.infer<typeof UploadDocumentResponseSchema>;
export type ListDocumentsResponse = z.infer<typeof ListDocumentsResponseSchema>;
export type RenderDocumentResponse = z.infer<typeof RenderDocumentResponseSchema>;
export type RewriteDocumentResponse = z.infer<typeof RewriteDocumentResponseSchema>;
export type TreeResponse = z.infer<typeof TreeResponseSchema>;
export type DeletePathResponse = z.infer<typeof DeletePathResponseSchema>;
export type ListAssetsResponse = z.infer<typeof ListAssetsResponseSchema>;
export type UploadAssetResponse = z.infer<typeof UploadAssetResponseSchema>;
export type ApiValidationError = z.infer<typeof ApiValidationErrorSchema>;
