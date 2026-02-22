import type {
  TemplateFile,
  TemplateFileExt,
  TemplateFileMetadata,
} from "@/lib/schemas";

const EXTENSIONS: TemplateFileExt[] = ["docx", "pptx", "xlsx"];

const MIME_BY_EXT: Record<TemplateFileExt, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function getTemplateFileExtension(name: string): TemplateFileExt | null {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const ext = name.slice(dotIndex + 1).toLowerCase();
  return EXTENSIONS.includes(ext as TemplateFileExt)
    ? (ext as TemplateFileExt)
    : null;
}

export function getTemplateMimeType(ext: TemplateFileExt): string {
  return MIME_BY_EXT[ext];
}

export function sanitizeTemplatePath(rawPath: string, fallbackName: string): string {
  const normalized = rawPath.replace(/\\/g, "/").trim();
  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "." && part !== "..");

  if (parts.length === 0) {
    return fallbackName;
  }

  return parts.join("/");
}

export function templateFileToMetadata(file: TemplateFile): TemplateFileMetadata {
  const hasGeneratedVersion = Boolean(file.generatedBase64);

  return {
    id: file.id,
    manualId: file.manualId,
    path: file.path,
    name: file.name,
    ext: file.ext,
    mimeType: file.mimeType,
    size: file.size,
    placeholders: file.placeholders,
    unresolvedPlaceholders: file.unresolvedPlaceholders,
    status: file.status,
    error: file.error,
    hasGeneratedVersion,
    lastGeneratedAt: file.lastGeneratedAt,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}
