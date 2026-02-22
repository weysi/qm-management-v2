/**
 * POST /api/canvas-editor/[projectId]/export/docx
 *
 * Export the current canvas model as a DOCX file.
 * Uses surgical XML patching to preserve all untouched content.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getProject,
  createVersion,
  recordExport,
  getProjectAssets,
} from "@/lib/project-workspace/workspace";
import { getTemplateFileOriginalBase64 } from "@/lib/project-workspace/store-adapter";
import {
  exportCanvasModelToDocx,
  getChangedBlockIds,
} from "@/lib/canvas-editor/docx-export";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get original DOCX binary
  const originalBase64 = getTemplateFileOriginalBase64(project.sourceFileId);
  if (!originalBase64) {
    return NextResponse.json(
      { error: "Original DOCX binary not found" },
      { status: 404 }
    );
  }

  const originalBuffer = Buffer.from(originalBase64, "base64");

  // Collect changed block IDs
  const changedBlockIds = getChangedBlockIds(project.canvasModel);

  // Collect new/modified assets
  const assets = getProjectAssets(projectId);
  const assetBuffers = new Map<
    string,
    { base64: string; filename: string; mimeType: string }
  >();
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
    console.error("[canvas-editor/export/docx] Export failed:", err);
    return NextResponse.json(
      { error: "DOCX export failed" },
      { status: 500 }
    );
  }

  // Create a version snapshot
  const docxBase64 = docxBuffer.toString("base64");
  const version = createVersion(projectId, {
    label: `Export — ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
    canvasModelSnapshot: project.canvasModel,
    docxBase64,
    createdBy: "user",
  });

  recordExport(projectId, "docx", version.id);

  // Return the DOCX binary
  const filename = `${project.name.replace(/[^a-z0-9_-]/gi, "_")}.docx`;
  return new NextResponse(new Uint8Array(docxBuffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(docxBuffer.length),
    },
  });
}
