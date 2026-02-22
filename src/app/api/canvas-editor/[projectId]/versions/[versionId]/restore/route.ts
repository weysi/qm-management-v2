/**
 * POST /api/canvas-editor/[projectId]/versions/[versionId]/restore
 *
 * Restore a version snapshot as the active canvas model.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getProject,
  restoreVersion,
  appendAuditEntry,
} from "@/lib/project-workspace/workspace";
import { randomUUID } from "crypto";

interface RouteParams {
  params: Promise<{ projectId: string; versionId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId, versionId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const restored = restoreVersion(projectId, versionId);
  if (!restored) {
    return NextResponse.json(
      { error: "Version not found or does not belong to this project" },
      { status: 404 }
    );
  }

  // Record audit entry
  appendAuditEntry(projectId, {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    operation: "version_restore",
    scope: "document",
    affectedBlockIds: [],
    changes: [],
  });

  return NextResponse.json({
    success: true,
    restoredAt: new Date().toISOString(),
    canvasModel: restored.canvasModel,
  });
}
