import { z } from 'zod';

export const DocumentVariableSourceSchema = z.enum([
  'user_input',
  'system',
  'ai_generated',
]);

export const DocumentVariableSchema = z.object({
  id: z.string().uuid(),
  variable_name: z.string().min(1),
  required: z.boolean(),
  source: DocumentVariableSourceSchema,
  type: z.string().default('string'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
});

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  version_number: z.number().int(),
  file_path: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  created_by: z.enum(['user', 'system', 'ai']),
  ai_prompt: z.string().nullable().optional(),
  ai_model: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
});

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  handbook_id: z.string(),
  name: z.string(),
  relative_path: z.string(),
  original_file_path: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  variables: z.array(DocumentVariableSchema).default([]),
  versions: z.array(DocumentVersionSchema).default([]),
});

export const WorkspaceAssetSchema = z.object({
  id: z.string().uuid(),
  handbook_id: z.string(),
  kind: z.enum(['logo', 'signature']),
  asset_type: z.enum(['logo', 'signature']),
  filename: z.string(),
  file_path: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  status: z.enum(['READY', 'PROCESSING', 'FAILED']),
  preview_url: z.string().nullable().optional(),
  download_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export interface FileTreeNode {
  id?: string;
  name: string;
  path: string;
  kind: 'folder' | 'file';
  deleted?: boolean;
  children?: FileTreeNode[];
}

export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    name: z.string(),
    path: z.string(),
    kind: z.enum(['folder', 'file']),
    deleted: z.boolean().optional(),
    children: z.array(FileTreeNodeSchema).optional(),
  }),
);

export const ApiValidationErrorSchema = z.object({
  variable: z.string().nullable().optional(),
  error_code: z.string(),
  message: z.string(),
  path: z.string().nullable().optional(),
  start: z.number().nullable().optional(),
  end: z.number().nullable().optional(),
});

export type DocumentVariable = z.infer<typeof DocumentVariableSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type WorkspaceAsset = z.infer<typeof WorkspaceAssetSchema>;
export type ApiValidationError = z.infer<typeof ApiValidationErrorSchema>;
