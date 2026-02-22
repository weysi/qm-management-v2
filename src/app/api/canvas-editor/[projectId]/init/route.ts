/**
 * POST /api/canvas-editor/[projectId]/init
 *
 * Create or retrieve a project workspace for a given TemplateFile.
 * If a workspace already exists for the sourceFileId, return it.
 * Otherwise, import the DOCX and create a new project.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProjectBySourceFileId,
  createProject,
  addAsset,
} from "@/lib/project-workspace/workspace";
import {
  getTemplateFileOriginalBase64,
  getTemplateFileMeta,
} from "@/lib/project-workspace/store-adapter";
import { importDocxToCanvasModel } from "@/lib/canvas-editor/docx-import";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const InitRequestSchema = z.object({
  sourceFileId: z.string().min(1),
  manualId: z.string().min(1),
});

export async function POST(req: NextRequest, { params: _params }: RouteParams) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = InitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { sourceFileId, manualId } = parsed.data;

  // Check if project already exists for this template file
  const existing = getProjectBySourceFileId(sourceFileId);
  if (existing) {
    return NextResponse.json({ projectId: existing.id, created: false });
  }

  // Get the original DOCX binary
  const base64 = getTemplateFileOriginalBase64(sourceFileId);
  if (!base64) {
    return NextResponse.json(
      { error: "Template file not found or has no original binary" },
      { status: 404 }
    );
  }

  const meta = getTemplateFileMeta(sourceFileId);
  if (!meta) {
    return NextResponse.json({ error: "Template file metadata not found" }, { status: 404 });
  }

  // Generate a temporary projectId for the import
  const { randomUUID } = await import("crypto");
  const tempProjectId = randomUUID();

  // Import DOCX to canvas model
  const buffer = Buffer.from(base64, "base64");
  let importResult;
  try {
    importResult = await importDocxToCanvasModel(buffer, {
      projectId: tempProjectId,
      sourceFileId,
    });
  } catch (err) {
    console.error("[canvas-editor/init] DOCX import failed:", err);
    return NextResponse.json(
      { error: "Failed to parse DOCX file" },
      { status: 500 }
    );
  }

  // Create the project workspace
  const project = createProject({
    manualId,
    sourceFileId,
    name: meta.name,
    canvasModel: importResult.canvasModel,
    docxBase64: base64,
  });

  // Store extracted assets
  for (const asset of importResult.assets) {
    const sizeBytes = Math.round((asset.base64.length * 3) / 4);
    addAsset({
      projectId: project.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      base64: asset.base64,
      sizeBytes,
      objectType: asset.objectType,
      classificationConfidence: asset.confidence,
    });
  }

  return NextResponse.json({ projectId: project.id, created: true });
}
