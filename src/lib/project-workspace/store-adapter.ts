/**
 * Adapter that bridges the canvas editor project workspace with the existing
 * TemplateFile store. Allows "Sync to Manual" to write the exported DOCX
 * back to the existing template file system.
 */

import { store } from "@/lib/store";
import type { TemplateFile } from "@/lib/schemas";

/**
 * Write an exported DOCX buffer back to the existing TemplateFile store.
 * This makes the canvas-editor export immediately available in the
 * existing TemplateCanvasWorkspace download/generate flow.
 */
export function syncExportToTemplateFile(
  templateFileId: string,
  docxBase64: string
): boolean {
  const file = store.templates.find((f: TemplateFile) => f.id === templateFileId);
  if (!file) return false;

  const idx = store.templates.indexOf(file);
  const now = new Date().toISOString();

  store.templates[idx] = {
    ...file,
    generatedBase64: docxBase64,
    status: "generated",
    lastGeneratedAt: now,
    updatedAt: now,
  };

  return true;
}

/**
 * Get the original DOCX binary (base64) for a TemplateFile.
 * Used to initialize the canvas model from an existing file.
 */
export function getTemplateFileOriginalBase64(
  templateFileId: string
): string | null {
  const file = store.templates.find((f: TemplateFile) => f.id === templateFileId);
  return file ? file.originalBase64 : null;
}

/**
 * Get the generated DOCX binary (base64) for a TemplateFile, if it exists.
 */
export function getTemplateFileGeneratedBase64(
  templateFileId: string
): string | null {
  const file = store.templates.find((f: TemplateFile) => f.id === templateFileId);
  return file?.generatedBase64 ?? null;
}

/**
 * Get template file metadata (without binary blobs).
 */
export function getTemplateFileMeta(
  templateFileId: string
): { name: string; manualId: string } | null {
  const file = store.templates.find((f: TemplateFile) => f.id === templateFileId);
  if (!file) return null;
  return { name: file.name, manualId: file.manualId };
}
