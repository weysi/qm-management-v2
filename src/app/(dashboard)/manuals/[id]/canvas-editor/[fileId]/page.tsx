/**
 * Canvas editor page route.
 * Initializes the project workspace for the given template file,
 * then renders the CanvasEditorPage component.
 */

import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { CanvasEditorPage } from "@/components/canvas-editor/CanvasEditorPage";
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
import { randomUUID } from "crypto";

interface PageParams {
  params: Promise<{ id: string; fileId: string }>;
}

export default async function CanvasEditorRoute({ params }: PageParams) {
  const { id: manualId, fileId } = await params;

  // Verify the template file exists
  const templateFile = store.templates.find((f) => f.id === fileId);
  if (!templateFile || templateFile.manualId !== manualId) {
    notFound();
  }

  // Only support DOCX files in MVP
  if (templateFile.ext !== "docx") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Nicht unterstützt</p>
          <p className="text-sm text-muted-foreground">
            Der erweiterte Editor unterstützt nur DOCX-Dateien.
          </p>
        </div>
      </div>
    );
  }

  // Get or create project workspace
  let project = getProjectBySourceFileId(fileId);

  if (!project) {
    const originalBase64 = getTemplateFileOriginalBase64(fileId);
    if (!originalBase64) notFound();

    const meta = getTemplateFileMeta(fileId);
    if (!meta) notFound();

    const tempProjectId = randomUUID();
    const buffer = Buffer.from(originalBase64, "base64");

    let importResult;
    try {
      importResult = await importDocxToCanvasModel(buffer, {
        projectId: tempProjectId,
        sourceFileId: fileId,
      });
    } catch (err) {
      console.error("[canvas-editor/page] DOCX import failed:", err);
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Import fehlgeschlagen</p>
            <p className="text-sm text-muted-foreground">
              Die DOCX-Datei konnte nicht verarbeitet werden.
            </p>
          </div>
        </div>
      );
    }

    project = createProject({
      manualId,
      sourceFileId: fileId,
      name: meta.name,
      canvasModel: importResult.canvasModel,
      docxBase64: originalBase64,
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
  }

  // Get the DOCX binary for WYSIWYG preview
  const docxBase64 =
    getTemplateFileOriginalBase64(fileId) ?? "";

  return (
    <CanvasEditorPage
      projectId={project.id}
      manualId={manualId}
      fileId={fileId}
      initialModel={project.canvasModel}
      docxBase64={docxBase64}
    />
  );
}

export const dynamic = "force-dynamic";
