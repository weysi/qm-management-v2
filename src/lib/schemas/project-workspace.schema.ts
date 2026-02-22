import { z } from "zod";
import { CanvasModelSchema, DocumentObjectSchema, PlacementRuleSchema } from "./canvas-model.schema";

// ─── Audit / Change Log ───────────────────────────────────────────────────────

export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  operation: z.enum([
    "ai_rewrite",
    "manual_edit",
    "object_move",
    "object_add",
    "object_delete",
    "version_restore",
    "import",
    "export",
  ]),
  scope: z.string().optional(),
  prompt: z.string().optional(),
  guardrails: z.record(z.string(), z.unknown()).optional(),
  affectedBlockIds: z.array(z.string()),
  changes: z.array(
    z.object({
      blockId: z.string(),
      before: z.string(),
      after: z.string(),
      accepted: z.boolean(),
      rejectionReason: z.string().optional(),
    })
  ),
  user: z.string().optional(),
});

export const ChangeLogSchema = z.object({
  projectId: z.string().uuid(),
  entries: z.array(AuditEntrySchema),
});

// ─── Project Assets ───────────────────────────────────────────────────────────

export const ProjectAssetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  base64: z.string(), // binary stored as base64 (same pattern as TemplateFile)
  sizeBytes: z.number().int().nonnegative(),
  objectType: DocumentObjectSchema.shape.objectType.optional(),
  classificationConfidence: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
});

// ─── Elements Registry ────────────────────────────────────────────────────────

export const SignatureElementSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string(),
  objectType: z.enum(["logo", "signature", "stamp"]),
  label: z.string(),
  placementRule: PlacementRuleSchema.optional(),
  currentPosition: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    pageNumber: z.number().int(),
    rotation: z.number(),
  }),
  anchorType: z.string(),
  wrapMode: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ElementsRegistrySchema = z.object({
  projectId: z.string().uuid(),
  elements: z.array(SignatureElementSchema),
  version: z.string().default("1"),
  updatedAt: z.string().datetime(),
});

// ─── Manifest ─────────────────────────────────────────────────────────────────

export const ManifestSchema = z.object({
  projectId: z.string().uuid(),
  schemaVersion: z.string().default("1.0.0"),
  sourceFile: z.object({
    name: z.string(),
    ext: z.enum(["docx", "odt"]),
    originalSha256: z.string(),
    importedAt: z.string().datetime(),
  }),
  assets: z.array(
    z.object({
      assetId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
      objectType: z.string().optional(),
    })
  ),
  workingVersionId: z.string().optional(),
  exportHistory: z.array(
    z.object({
      exportedAt: z.string().datetime(),
      format: z.enum(["docx", "pdf", "odt"]),
      versionId: z.string(),
    })
  ),
});

// ─── Versions ─────────────────────────────────────────────────────────────────

export const ProjectVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  label: z.string(), // e.g. "v1.2" or "Before AI rewrite — 2026-02-21"
  canvasModelSnapshot: CanvasModelSchema,
  docxBase64: z.string(), // the DOCX at this version
  createdAt: z.string().datetime(),
  createdBy: z.enum(["user", "ai_operation", "system"]),
});

// ─── Project Workspace ────────────────────────────────────────────────────────

export const ProjectWorkspaceSchema = z.object({
  id: z.string().uuid(),
  manualId: z.string(),
  sourceFileId: z.string(), // the TemplateFile.id it was created from
  name: z.string(),
  canvasModel: CanvasModelSchema,
  manifest: ManifestSchema,
  elements: ElementsRegistrySchema,
  status: z.enum(["active", "archived"]).default("active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── API request/response schemas ─────────────────────────────────────────────

export const CreateProjectWorkspaceRequestSchema = z.object({
  manualId: z.string().min(1),
  sourceFileId: z.string().min(1),
  name: z.string().min(1),
});

export const CreateVersionRequestSchema = z.object({
  label: z.string().min(1),
  createdBy: ProjectVersionSchema.shape.createdBy.optional().default("user"),
});

export const UploadAssetRequestSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  objectType: ProjectAssetSchema.shape.objectType,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type ChangeLog = z.infer<typeof ChangeLogSchema>;
export type ProjectAsset = z.infer<typeof ProjectAssetSchema>;
export type SignatureElement = z.infer<typeof SignatureElementSchema>;
export type ElementsRegistry = z.infer<typeof ElementsRegistrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;
export type ProjectWorkspace = z.infer<typeof ProjectWorkspaceSchema>;
