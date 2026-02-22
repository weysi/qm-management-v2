/**
 * GET  /api/canvas-editor/[projectId]/document  — Fetch canvas model
 * PUT  /api/canvas-editor/[projectId]/document  — Save canvas model
 *
 * Follows the same previewVersion concurrency pattern as
 * /api/template-files/[manualId]/[fileId]/preview/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProject, updateProjectCanvasModel } from "@/lib/project-workspace/workspace";
import { CanvasModelSchema } from "@/lib/schemas/canvas-model.schema";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET — return the current canvas model
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    canvasModel: project.canvasModel,
    manifest: project.manifest,
    elements: project.elements,
    status: project.status,
  });
}

const SaveRequestSchema = z.object({
  canvasModel: CanvasModelSchema,
  createVersion: z.boolean().optional().default(false),
  versionLabel: z.string().optional(),
});

// PUT — save the canvas model
export async function PUT(req: NextRequest, { params }: RouteParams) {
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

  const parsed = SaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { canvasModel, createVersion, versionLabel } = parsed.data;

  // Verify projectId matches
  if (canvasModel.projectId !== projectId) {
    return NextResponse.json(
      { error: "Canvas model projectId mismatch" },
      { status: 400 }
    );
  }

  const updated = updateProjectCanvasModel(projectId, canvasModel);
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update canvas model" },
      { status: 500 }
    );
  }

  // Optionally create a version snapshot
  if (createVersion) {
    const { createVersion: createVersionFn } = await import(
      "@/lib/project-workspace/workspace"
    );
    createVersionFn(projectId, {
      label: versionLabel ?? `Manual save — ${new Date().toLocaleDateString("de-DE")}`,
      canvasModelSnapshot: canvasModel,
      docxBase64: "", // will be filled on next export
      createdBy: "user",
    });
  }

  return NextResponse.json({ success: true, updatedAt: updated.updatedAt });
}
