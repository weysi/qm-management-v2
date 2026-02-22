/**
 * POST /api/canvas-editor/[projectId]/sync
 *
 * "Sync to Manual" — export the canvas model as DOCX and write it back
 * to the existing TemplateFile store as generatedBase64.
 * This makes the export immediately available in the existing
 * TemplateCanvasWorkspace download/generate flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject, getProjectAssets } from "@/lib/project-workspace/workspace";
import { getTemplateFileOriginalBase64, syncExportToTemplateFile } from "@/lib/project-workspace/store-adapter";
import { exportCanvasModelToDocx, getChangedBlockIds } from "@/lib/canvas-editor/docx-export";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const originalBase64 = getTemplateFileOriginalBase64(project.sourceFileId);
  if (!originalBase64) {
    return NextResponse.json({ error: "Original DOCX binary not found" }, { status: 404 });
  }

  const originalBuffer = Buffer.from(originalBase64, "base64");
  const changedBlockIds = getChangedBlockIds(project.canvasModel);

  const assets = getProjectAssets(projectId);
  const assetBuffers = new Map<string, { base64: string; filename: string; mimeType: string }>();
  for (const asset of assets) {
    assetBuffers.set(asset.id, {
      base64: asset.base64,
      filename: asset.filename,
      mimeType: asset.mimeType,
    });
  }

  let docxBuffer: Buffer;
  try {
    docxBuffer = await exportCanvasModelToDocx(
      project.canvasModel,
      originalBuffer,
      changedBlockIds,
      assetBuffers
    );
  } catch (err) {
    console.error("[canvas-editor/sync] Export failed:", err);
    return NextResponse.json({ error: "DOCX export failed" }, { status: 500 });
  }

  const docxBase64 = docxBuffer.toString("base64");
  const success = syncExportToTemplateFile(project.sourceFileId, docxBase64);

  if (!success) {
    return NextResponse.json({ error: "Template file sync failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, syncedAt: new Date().toISOString() });
}
