/**
 * POST /api/canvas-editor/[projectId]/export/pdf
 *
 * Export the current canvas model as a PDF via LibreOffice headless.
 * Gated by LIBREOFFICE_AVAILABLE=true environment variable.
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
import {
  convertDocxToPdf,
  isLibreOfficeAvailable,
  LibreOfficeNotAvailableError,
  LibreOfficeConversionError,
} from "@/lib/canvas-editor/pdf-export";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  if (!isLibreOfficeAvailable()) {
    return NextResponse.json(
      {
        error:
          "PDF export requires LibreOffice on the server. Set LIBREOFFICE_AVAILABLE=true.",
      },
      { status: 501 }
    );
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const originalBase64 = getTemplateFileOriginalBase64(project.sourceFileId);
  if (!originalBase64) {
    return NextResponse.json(
      { error: "Original DOCX binary not found" },
      { status: 404 }
    );
  }

  const originalBuffer = Buffer.from(originalBase64, "base64");
  const changedBlockIds = getChangedBlockIds(project.canvasModel);

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
    console.error("[canvas-editor/export/pdf] DOCX export step failed:", err);
    return NextResponse.json({ error: "DOCX export step failed" }, { status: 500 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(docxBuffer);
  } catch (err) {
    if (err instanceof LibreOfficeNotAvailableError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    if (err instanceof LibreOfficeConversionError) {
      console.error("[canvas-editor/export/pdf] LibreOffice error:", err.message);
      return NextResponse.json(
        { error: "PDF conversion failed. Check server LibreOffice installation." },
        { status: 500 }
      );
    }
    throw err;
  }

  // Record version
  const docxBase64 = docxBuffer.toString("base64");
  const version = createVersion(projectId, {
    label: `PDF Export — ${new Date().toLocaleDateString("de-DE")}`,
    canvasModelSnapshot: project.canvasModel,
    docxBase64,
    createdBy: "user",
  });
  recordExport(projectId, "pdf", version.id);

  const filename = `${project.name.replace(/[^a-z0-9_-]/gi, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
