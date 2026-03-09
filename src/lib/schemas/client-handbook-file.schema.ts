import { z } from 'zod';

export const ClientHandbookFileSchema = z.object({
  id: z.string().uuid(),
  path_in_handbook: z.string(),
  file_type: z.enum(['DOCX', 'PPTX', 'XLSX', 'OTHER']),
  parse_status: z.enum(['PENDING', 'PARSED', 'FAILED']),
  placeholder_total: z.number().int().nonnegative(),
  placeholder_resolved: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  deletable: z.boolean().default(true),
});

export const ClientHandbookFileGroupSchema = z.object({
  handbook_id: z.string().uuid(),
  handbook_type: z.string(),
  handbook_status: z.string(),
  handbook_created_at: z.string(),
  handbook_updated_at: z.string(),
  file_count: z.number().int().nonnegative(),
  files: z.array(ClientHandbookFileSchema),
});

export const ClientHandbookFileGroupsResponseSchema = z.object({
  client_id: z.string().uuid(),
  groups: z.array(ClientHandbookFileGroupSchema),
});

export type ClientHandbookFile = z.infer<typeof ClientHandbookFileSchema>;
export type ClientHandbookFileGroup = z.infer<typeof ClientHandbookFileGroupSchema>;
export type ClientHandbookFileGroupsResponse = z.infer<
  typeof ClientHandbookFileGroupsResponseSchema
>;
