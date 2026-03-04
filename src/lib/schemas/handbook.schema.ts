import { z } from 'zod';

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
  resolved: z.boolean(),
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
});

export type HandbookType = z.infer<typeof HandbookTypeSchema>;
export type HandbookStatus = z.infer<typeof HandbookStatusSchema>;
export type Handbook = z.infer<typeof HandbookSchema>;
export type HandbookFile = z.infer<typeof HandbookFileSchema>;
export type HandbookPlaceholder = z.infer<typeof HandbookPlaceholderSchema>;
export type HandbookSnapshot = z.infer<typeof HandbookSnapshotSchema>;
export type HandbookCompletionFile = z.infer<typeof HandbookCompletionFileSchema>;
export type HandbookCompletion = z.infer<typeof HandbookCompletionSchema>;
