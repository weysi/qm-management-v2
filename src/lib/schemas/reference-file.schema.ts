import { z } from 'zod';

export const ReferenceFileTypeSchema = z.enum([
  'DOCX',
  'PPTX',
  'XLSX',
  'TXT',
  'MD',
  'PDF',
  'OTHER',
]);

export const ReferenceParseStatusSchema = z.enum(['PENDING', 'PARSED', 'UNSUPPORTED', 'FAILED']);

export const ReferenceScopeSchema = z.enum(['handbook', 'file', 'placeholder']);

export const ReferenceDocumentLinkSchema = z.object({
  id: z.string().uuid(),
  reference_document_id: z.string().uuid(),
  scope: ReferenceScopeSchema,
  handbook_file_id: z.string().uuid().nullable().optional(),
  placeholder_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
});

export const ReferenceDocumentSchema = z.object({
  id: z.string().uuid(),
  handbook_id: z.string().uuid(),
  original_filename: z.string(),
  file_type: ReferenceFileTypeSchema,
  mime_type: z.string(),
  storage_path: z.string(),
  normalized_storage_path: z.string(),
  checksum: z.string(),
  size_bytes: z.number().int().nonnegative(),
  parse_status: ReferenceParseStatusSchema,
  parse_error: z.string(),
  summary: z.string(),
  section_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
  links: z.array(ReferenceDocumentLinkSchema).default([]),
});

export const ReferenceChunkSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  reference_document_id: z.string().uuid().nullable().optional(),
  ordinal: z.number().int().nullable().optional(),
  chunk_type: z.string().nullable().optional(),
  title: z.string(),
  locator: z.record(z.string(), z.unknown()).default({}),
  content: z.string(),
  content_hash: z.string().nullable().optional(),
  estimated_tokens: z.number().int().nonnegative(),
  created_at: z.string().optional(),
});

export const ReferencePreviewSchema = z.object({
  reference_document: ReferenceDocumentSchema,
  summary: z.string(),
  sections: z.array(ReferenceChunkSchema),
  links: z.array(ReferenceDocumentLinkSchema).default([]),
});

export const ReferenceComposeTraceItemSchema = z.object({
  reference_document_id: z.string().uuid().nullable().optional(),
  reference_document_title: z.string().nullable().optional(),
  chunk_id: z.string().uuid().nullable().optional(),
  title: z.string().nullable().optional(),
  locator: z.record(z.string(), z.unknown()).default({}),
  estimated_tokens: z.number().int().nonnegative().nullable().optional(),
});

export type ReferenceFileType = z.infer<typeof ReferenceFileTypeSchema>;
export type ReferenceParseStatus = z.infer<typeof ReferenceParseStatusSchema>;
export type ReferenceScope = z.infer<typeof ReferenceScopeSchema>;
export type ReferenceDocumentLink = z.infer<typeof ReferenceDocumentLinkSchema>;
export type ReferenceDocument = z.infer<typeof ReferenceDocumentSchema>;
export type ReferenceChunk = z.infer<typeof ReferenceChunkSchema>;
export type ReferencePreview = z.infer<typeof ReferencePreviewSchema>;
export type ReferenceComposeTraceItem = z.infer<typeof ReferenceComposeTraceItemSchema>;
