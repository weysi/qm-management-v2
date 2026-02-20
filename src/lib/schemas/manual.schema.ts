import { z } from "zod";

export const ManualSectionSchema = z.object({
  id: z.string(),
  chapterNumber: z.string(),
  title: z.string(),
  content: z.string(),
  placeholders: z.array(z.string()),
  aiGenerated: z.boolean().default(false),
  order: z.number().int().nonnegative(),
});

export const ManualSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  title: z.string(),
  version: z.string().default("1.0"),
  sections: z.array(ManualSectionSchema),
  status: z.enum(["draft", "in_progress", "complete"]).default("draft"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateManualSchema = ManualSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ManualSection = z.infer<typeof ManualSectionSchema>;
export type Manual = z.infer<typeof ManualSchema>;
export type CreateManualInput = z.infer<typeof CreateManualSchema>;
