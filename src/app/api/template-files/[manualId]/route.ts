import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { TemplateFileMetadata, TemplateFile } from "@/lib/schemas";
import { store } from "@/lib/store";
import {
  extractPlaceholdersFromOoxml,
  getTemplateFileExtension,
  getTemplateMimeType,
  sanitizeTemplatePath,
  templateFileToMetadata,
} from "@/lib/template-files";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

interface RejectedUpload {
  path: string;
  reason: string;
}

function getManual(manualId: string) {
  return store.manuals.find((manual) => manual.id === manualId);
}

function fileNameFromPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { manualId } = await params;

  if (!getManual(manualId)) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const files: TemplateFileMetadata[] = store.templates
    .filter((file) => file.manualId === manualId)
    .map(templateFileToMetadata)
    .sort((a, b) => a.path.localeCompare(b.path));

  return NextResponse.json(files);
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;

  if (!getManual(manualId)) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const uploadedFiles = formData.getAll("files");
  const uploadedPaths = formData.getAll("paths");

  if (uploadedFiles.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const created: TemplateFileMetadata[] = [];
  const rejected: RejectedUpload[] = [];

  for (let i = 0; i < uploadedFiles.length; i++) {
    const candidate = uploadedFiles[i];

    if (!(candidate instanceof File)) {
      rejected.push({
        path: `file-${i + 1}`,
        reason: "Invalid file payload",
      });
      continue;
    }

    const rawPathCandidate = uploadedPaths[i];
    const rawPath =
      typeof rawPathCandidate === "string" && rawPathCandidate.trim() !== ""
        ? rawPathCandidate
        : candidate.name;

    const sanitizedPath = sanitizeTemplatePath(rawPath, candidate.name);
    const ext =
      getTemplateFileExtension(sanitizedPath) ??
      getTemplateFileExtension(candidate.name);

    if (!ext) {
      rejected.push({
        path: sanitizedPath,
        reason: "Unsupported file type. Only .docx and .pptx are allowed.",
      });
      continue;
    }

    try {
      const input = Buffer.from(await candidate.arrayBuffer());
      const placeholders = await extractPlaceholdersFromOoxml(input, ext);
      const now = new Date().toISOString();

      const file: TemplateFile = {
        id: randomUUID(),
        manualId,
        path: sanitizedPath,
        name: fileNameFromPath(sanitizedPath),
        ext,
        mimeType: candidate.type || getTemplateMimeType(ext),
        size: candidate.size,
        placeholders,
        unresolvedPlaceholders: placeholders,
        status: "uploaded",
        originalBase64: input.toString("base64"),
        createdAt: now,
        updatedAt: now,
      };

      store.templates.push(file);
      created.push(templateFileToMetadata(file));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not parse OOXML template file";

      rejected.push({
        path: sanitizedPath,
        reason: message,
      });
    }
  }

  if (created.length === 0) {
    return NextResponse.json(
      {
        error: "No valid template files uploaded",
        rejected,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      files: created,
      rejected,
    },
    { status: 201 }
  );
}
