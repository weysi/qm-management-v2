import { z } from 'zod';
import {
  ReferenceComposeTraceItemSchema,
  ReferenceSkippedTraceItemSchema,
  ReferenceScopeSchema,
} from './reference-file.schema';

export const HandbookTypeSchema = z.enum([
  'ISO9001',
  'ISO14001',
  'ISO45001',
  'SCC_STAR',
  'SCC_DOUBLESTAR',
  'SCCP',
  'SCP',
]);

export const HandbookStatusSchema = z.enum([
  'DRAFT',
  'IN_PROGRESS',
  'READY',
  'EXPORTED',
]);

export const HandbookSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  type: HandbookTypeSchema,
  status: HandbookStatusSchema,
  root_storage_path: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const HandbookFileSchema = z.object({
  id: z.string().uuid(),
  handbook_id: z.string().uuid(),
  path_in_handbook: z.string(),
  file_type: z.enum(['DOCX', 'PPTX', 'XLSX', 'OTHER']),
  original_blob_ref: z.string(),
  working_blob_ref: z.string(),
  parse_status: z.enum(['PENDING', 'PARSED', 'FAILED']),
  checksum: z.string(),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  placeholder_total: z.number().int().nonnegative(),
  placeholder_resolved: z.number().int().nonnegative(),
  parse_error: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export interface HandbookTreeNode {
  id?: string;
  name: string;
  path: string;
  kind: 'folder' | 'file';
  children?: HandbookTreeNode[];
  file_type?: 'DOCX' | 'PPTX' | 'XLSX' | 'OTHER';
  parse_status?: 'PENDING' | 'PARSED' | 'FAILED';
  placeholder_total?: number;
  placeholder_resolved?: number;
  is_complete?: boolean;
}

export const HandbookTreeNodeSchema: z.ZodType<HandbookTreeNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    name: z.string(),
    path: z.string(),
    kind: z.enum(['folder', 'file']),
    children: z.array(HandbookTreeNodeSchema).optional(),
    file_type: z.enum(['DOCX', 'PPTX', 'XLSX', 'OTHER']).optional(),
    parse_status: z.enum(['PENDING', 'PARSED', 'FAILED']).optional(),
    placeholder_total: z.number().int().optional(),
    placeholder_resolved: z.number().int().optional(),
    is_complete: z.boolean().optional(),
  }),
);

export const HandbookPlaceholderSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  kind: z.enum(['TEXT', 'ASSET']),
  required: z.boolean(),
  occurrences: z.number().int().nonnegative(),
  meta: z.record(z.string(), z.unknown()).default({}),
  value_text: z.string().nullable().optional(),
  asset_id: z.string().nullable().optional(),
  source: z.enum(['MANUAL', 'AI', 'IMPORTED', 'COMPOSED']).nullable().optional(),
  resolved: z.boolean(),
  latest_audit: z
    .object({
      id: z.string().uuid(),
      mode: z.enum(['quick_fill', 'compose']),
      output_style: z.string(),
      language: z.string(),
      model: z.string(),
      total_tokens: z.number().int().nonnegative(),
      success: z.boolean(),
      created_at: z.string(),
    })
    .nullable()
    .optional(),
  suggested_mode: z.string().optional(),
  suggested_output_class: z.enum(['short', 'medium', 'long']).optional(),
  supported_capabilities: z.array(z.string()).default([]),
});

export const HandbookComposeConfigSchema = z.object({
  supported_languages: z.array(z.string()),
  reference_scopes: z.array(ReferenceScopeSchema),
  output_styles: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      output_class: z.enum(['short', 'medium', 'long']),
    }),
  ),
  capabilities: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      supported_file_types: z.array(z.string()),
      supported_placeholder_kinds: z.array(z.string()),
      requires_references: z.boolean(),
      output_class: z.enum(['short', 'medium', 'long']),
      ui_entry_point: z.string(),
    }),
  ),
  limits: z.object({
    max_reference_documents: z.number().int().positive(),
    max_reference_chunks: z.number().int().positive(),
    max_reference_tokens: z.number().int().positive(),
  }),
});

export const HandbookComposeTraceSchema = z.object({
  generation_mode: z.string(),
  selected_references: z.array(ReferenceComposeTraceItemSchema).default([]),
  requested_reference_ids: z.array(z.string()).default([]),
  used_reference_ids: z.array(z.string()).default([]),
  skipped_references: z.array(ReferenceSkippedTraceItemSchema).default([]),
  chunk_count: z.number().int().nonnegative(),
  target_intent: z.string().optional(),
  tenant_context_summary: z.string().optional(),
  token_budget: z
    .object({
      max_reference_documents: z.number().int().positive(),
      max_reference_chunks: z.number().int().positive(),
      max_reference_tokens: z.number().int().positive(),
      selected_reference_tokens: z.number().int().nonnegative(),
    })
    .optional(),
  file_context_used: z.record(z.string(), z.unknown()).default({}),
  fallback_path: z.string(),
  selection_trace: z.record(z.string(), z.unknown()).optional(),
  mode_hint: z.string().nullable().optional(),
});

export const HandbookComposeResponseSchema = z.object({
  value: z.string(),
  mode: z.enum(['quick_fill', 'compose']),
  output_class: z.enum(['short', 'medium', 'long']),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
  audit: z.record(z.string(), z.unknown()),
  trace: HandbookComposeTraceSchema,
});

export const HandbookSnapshotSchema = z.object({
  id: z.string().uuid(),
  handbook_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  manifest: z.record(z.string(), z.unknown()),
  downloadable: z.boolean().default(false),
  download_url: z.string().nullable().optional(),
  created_at: z.string(),
});

export const HandbookCompletionFileSchema = z.object({
  file_id: z.string().uuid(),
  path: z.string(),
  required_total: z.number().int().nonnegative(),
  required_resolved: z.number().int().nonnegative(),
  is_complete_required: z.boolean(),
});

export const HandbookCompletionSchema = z.object({
  handbook_id: z.string().uuid(),
  required_total: z.number().int().nonnegative(),
  required_resolved: z.number().int().nonnegative(),
  is_complete_required: z.boolean(),
  files: z.array(HandbookCompletionFileSchema),
  placeholders: z
    .array(
      z.object({
        file_id: z.string().uuid(),
        key: z.string(),
        kind: z.enum(['TEXT', 'ASSET']),
        required: z.boolean(),
        resolved: z.boolean(),
        value_hash: z.string().default(''),
        asset_id: z.string().nullable().optional(),
      }),
    )
    .default([]),
  file_checksums: z
    .array(
      z.object({
        file_id: z.string().uuid(),
        path: z.string(),
        checksum: z.string(),
        file_type: z.string(),
      }),
    )
    .default([]),
  completion_hash: z.string().optional(),
});

export type HandbookType = z.infer<typeof HandbookTypeSchema>;
export type HandbookStatus = z.infer<typeof HandbookStatusSchema>;
export type Handbook = z.infer<typeof HandbookSchema>;
export type HandbookFile = z.infer<typeof HandbookFileSchema>;
export type HandbookPlaceholder = z.infer<typeof HandbookPlaceholderSchema>;
export type HandbookComposeConfig = z.infer<typeof HandbookComposeConfigSchema>;
export type HandbookComposeTrace = z.infer<typeof HandbookComposeTraceSchema>;
export type HandbookComposeResponse = z.infer<typeof HandbookComposeResponseSchema>;
export type HandbookSnapshot = z.infer<typeof HandbookSnapshotSchema>;
export type HandbookCompletionFile = z.infer<typeof HandbookCompletionFileSchema>;
export type HandbookCompletion = z.infer<typeof HandbookCompletionSchema>;
