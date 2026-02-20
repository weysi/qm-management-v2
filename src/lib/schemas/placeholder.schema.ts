import { z } from "zod";

export const PlaceholderSchema = z.object({
  key: z.string().regex(/^[A-Z0-9_]+$/, "Key must be uppercase with underscores"),
  value: z.string(),
  autoFilled: z.boolean().default(false),
  resolved: z.boolean().default(false),
  chapterNumber: z.string().optional(),
});

export const PlaceholderMapSchema = z.record(
  z.string(),
  z.string()
);

export type Placeholder = z.infer<typeof PlaceholderSchema>;
export type PlaceholderMap = z.infer<typeof PlaceholderMapSchema>;
