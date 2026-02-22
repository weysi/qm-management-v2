/**
 * GET  /api/canvas-editor/[projectId]/versions — List versions
 * POST /api/canvas-editor/[projectId]/versions — Create version snapshot
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProject,
  getProjectVersions,
  createVersion,
} from "@/lib/project-workspace/workspace";
import { getTemplateFileOriginalBase64 } from "@/lib/project-workspace/store-adapter";
import { exportCanvasModelToDocx, getChangedBlockIds } from "@/lib/canvas-editor/docx-export";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const versions = getProjectVersions(projectId);

  // Return metadata without the large snapshots/blobs
  const metadata = versions.map((v) => ({
    id: v.id,
    label: v.label,
    createdAt: v.createdAt,
    createdBy: v.createdBy,
    pageCount: v.canvasModelSnapshot.metadata.pageCount,
    hasDocx: !!v.docxBase64,
  }));

  return NextResponse.json({ versions: metadata });
}

const CreateVersionRequestSchema = z.object({
  label: z.string().min(1),
  createdBy: z.enum(["user", "ai_operation", "system"]).optional().default("user"),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateVersionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Export DOCX for this snapshot
  const originalBase64 = getTemplateFileOriginalBase64(project.sourceFileId);
  let docxBase64 = "";

  if (originalBase64) {
    try {
      const originalBuffer = Buffer.from(originalBase64, "base64");
      const changedBlockIds = getChangedBlockIds(project.canvasModel);
      const docxBuffer = await exportCanvasModelToDocx(
        project.canvasModel,
        originalBuffer,
        changedBlockIds,
        new Map()
      );
      docxBase64 = docxBuffer.toString("base64");
    } catch {
      // Non-fatal: version is created without DOCX snapshot
      docxBase64 = "";
    }
  }

  const version = createVersion(projectId, {
    label: parsed.data.label,
    canvasModelSnapshot: project.canvasModel,
    docxBase64,
    createdBy: parsed.data.createdBy,
  });

  return NextResponse.json({
    version: {
      id: version.id,
      label: version.label,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
    },
  });
}
