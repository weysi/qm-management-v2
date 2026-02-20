import { z } from "zod";

export const ReferenceFileSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  linkedChapters: z.array(z.string()),
  content: z.string(),
  manualId: z.string().uuid(),
  generatedAt: z.string().datetime(),
});

export const CreateReferenceFileSchema = ReferenceFileSchema.omit({
  id: true,
  generatedAt: true,
});

export type ReferenceFile = z.infer<typeof ReferenceFileSchema>;
export type CreateReferenceFileInput = z.infer<typeof CreateReferenceFileSchema>;
